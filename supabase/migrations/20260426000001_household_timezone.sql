-- ============================================================
-- Household timezone — date correctness for "today" / "this week"
--
-- Problem: every "today" / "this week" computation used server UTC.
-- claimTask and logScreenTime stamped completed_date / usage_date from
-- new Date().toISOString(); the SQL helpers used current_date. For
-- users in the Americas, late-evening local time is already "tomorrow"
-- in UTC — so Saturday-night chores landed in the next week's bucket
-- and the Sunday rollover missed them.
--
-- Fix: store an IANA timezone per household and compute every local
-- date from `now() at time zone <tz>` (SQL) or Intl.DateTimeFormat
-- (TS). The cron runs hourly so each household rolls when ITS local
-- clock crosses Sunday midnight, regardless of UTC.
--
-- Existing data: completed_date / usage_date rows written by older
-- code are stamped in UTC. We do NOT retroactively shift them — that
-- would risk re-bucketing claims across day/week boundaries in ways
-- that'd surprise users. Old summary rows that were rolled with the
-- UTC logic are also left alone; if a household wants to re-roll, an
-- admin can delete those summaries and call process_weekly_rollover().
-- ============================================================

alter table households
  add column timezone text not null default 'America/Denver';

-- Mirrors auth_household_id() / auth_role(). Returns the timezone the
-- caller's household is configured for, or the default if anything is
-- missing. SECURITY DEFINER so it works for any authenticated caller.
create or replace function auth_household_timezone()
returns text as $$
  select coalesce(h.timezone, 'America/Denver')
  from profiles p
  join households h on h.id = p.household_id
  where p.id = auth.uid();
$$ language sql stable security definer;

grant execute on function auth_household_timezone() to authenticated;

-- The old UTC-only helpers had only one in-schema caller
-- (child_current_balance) which we're rewriting below. Drop them so
-- nothing accidentally keeps reaching for the UTC date.
drop function if exists current_week_start();
drop function if exists current_week_end();

-- ============================================================
-- child_current_balance — tz-aware
-- ============================================================

create or replace function child_current_balance(p_child_id uuid)
returns integer as $$
declare
  v_tz text;
  v_local_date date;
  v_week_start date;
  v_carryover integer;
  v_earned integer;
  v_used integer;
  v_adjustments integer;
begin
  select coalesce(h.timezone, 'America/Denver') into v_tz
  from profiles p
  join households h on h.id = p.household_id
  where p.id = p_child_id;

  if v_tz is null then
    v_tz := 'America/Denver';
  end if;

  v_local_date := (now() at time zone v_tz)::date;
  v_week_start := v_local_date - extract(dow from v_local_date)::int;

  select coalesce(
    (select ws.carryover_out
     from weekly_summaries ws
     where ws.child_id = p_child_id
     order by ws.week_start desc
     limit 1),
    0
  ) into v_carryover;

  select coalesce(sum(tc.minutes_earned), 0)
  into v_earned
  from task_completions tc
  where tc.child_id = p_child_id
    and tc.completed_date >= v_week_start
    and tc.completed_date <= v_local_date;

  select coalesce(sum(stu.minutes_used), 0)
  into v_used
  from screen_time_usage stu
  where stu.child_id = p_child_id
    and stu.usage_date >= v_week_start
    and stu.usage_date <= v_local_date;

  -- Adjustments use created_at (timestamptz). Convert each local-date
  -- boundary to the matching UTC instant by interpreting it as midnight
  -- in the household's timezone.
  select coalesce(sum(ba.minutes), 0)
  into v_adjustments
  from balance_adjustments ba
  where ba.child_id = p_child_id
    and ba.created_at >= (v_week_start::timestamp at time zone v_tz)
    and ba.created_at < ((v_week_start + 7)::timestamp at time zone v_tz);

  return v_carryover + v_earned - v_used + v_adjustments;
end;
$$ language plpgsql stable security definer;

-- ============================================================
-- process_weekly_rollover — iterates per household, rolls each on its
-- own local Sunday. Idempotent — safe to schedule hourly so each
-- timezone gets picked up shortly after local Sunday midnight.
-- ============================================================

create or replace function process_weekly_rollover()
returns void as $$
declare
  v_household record;
  v_child record;
  v_local_date date;
  v_week_start date;
  v_week_end date;
  v_earned integer;
  v_used integer;
  v_adjustments integer;
  v_carryover_in integer;
  v_raw_balance integer;
  v_penalty integer;
  v_carryover_out integer;
begin
  for v_household in
    select id, timezone from households where is_paused = false
  loop
    v_local_date := (now() at time zone v_household.timezone)::date;
    -- The most recent COMPLETE Sun-Sat in this household's local time.
    -- (Today's local DOW = 0..6 for Sun..Sat. -dow lands you on Sunday;
    -- -1 more lands on the prior Saturday, which is last week's end.)
    v_week_end := v_local_date - extract(dow from v_local_date)::int - 1;
    v_week_start := v_week_end - 6;

    for v_child in
      select p.id as child_id
      from profiles p
      where p.household_id = v_household.id
        and p.role = 'child'
        and p.is_active = true
    loop
      if exists (
        select 1 from weekly_summaries
        where child_id = v_child.child_id and week_start = v_week_start
      ) then
        continue;
      end if;

      select coalesce(
        (select ws.carryover_out
         from weekly_summaries ws
         where ws.child_id = v_child.child_id
         order by ws.week_start desc
         limit 1),
        0
      ) into v_carryover_in;

      select coalesce(sum(tc.minutes_earned), 0)
      into v_earned
      from task_completions tc
      where tc.child_id = v_child.child_id
        and tc.completed_date >= v_week_start
        and tc.completed_date <= v_week_end;

      select coalesce(sum(stu.minutes_used), 0)
      into v_used
      from screen_time_usage stu
      where stu.child_id = v_child.child_id
        and stu.usage_date >= v_week_start
        and stu.usage_date <= v_week_end;

      select coalesce(sum(ba.minutes), 0)
      into v_adjustments
      from balance_adjustments ba
      where ba.child_id = v_child.child_id
        and ba.created_at >= (v_week_start::timestamp at time zone v_household.timezone)
        and ba.created_at < ((v_week_end + 1)::timestamp at time zone v_household.timezone);

      v_raw_balance := v_carryover_in + v_earned - v_used + v_adjustments;

      if v_raw_balance < 0 then
        v_penalty := abs(v_raw_balance);
        v_carryover_out := v_raw_balance - v_penalty;
      else
        v_penalty := 0;
        v_carryover_out := v_raw_balance;
      end if;

      insert into weekly_summaries (
        child_id, week_start, week_end,
        minutes_earned, minutes_used, adjustments,
        carryover_in, raw_balance, penalty, carryover_out
      ) values (
        v_child.child_id, v_week_start, v_week_end,
        v_earned, v_used, v_adjustments,
        v_carryover_in, v_raw_balance, v_penalty, v_carryover_out
      );
    end loop;
  end loop;
end;
$$ language plpgsql security definer;

-- Recommended cron schedule (commented — pg_cron may not be enabled in
-- local dev). With timezone-aware rollover, hourly is the right cadence
-- so each household gets picked up shortly after its local Sunday-midnight:
--   select cron.schedule('weekly-rollover', '0 * * * *', 'select process_weekly_rollover()');
