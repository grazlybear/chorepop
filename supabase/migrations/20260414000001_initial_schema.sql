-- ============================================================
-- ChorePoppin' Initial Schema
-- ============================================================

-- Enable required extensions
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

-- ============================================================
-- ENUM TYPES
-- ============================================================

create type member_role as enum ('owner', 'parent', 'child');
create type reward_type as enum ('fixed', 'per_minute');
create type recurrence_type as enum ('daily', 'weekly', 'anytime');

-- ============================================================
-- TABLES
-- ============================================================

-- households
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null, -- FK added after profiles exists
  invite_code text not null unique,
  is_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- profiles
create table profiles (
  id uuid primary key, -- matches auth.users.id for parents; generated for kids
  household_id uuid references households(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  role member_role not null default 'child',
  pin_hash text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Now add the deferred FK from households.created_by → profiles.id
alter table households
  add constraint households_created_by_fkey
  foreign key (created_by) references profiles(id);

-- tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  description text,
  icon text not null default '✅',
  reward_type reward_type not null default 'fixed',
  reward_amount integer not null default 0,
  recurrence recurrence_type not null default 'daily',
  is_shared boolean not null default true,
  max_daily_minutes integer,
  is_active boolean not null default true,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- task_assignments (which kids can see/claim which tasks)
create table task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  child_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, child_id)
);

-- task_completions
create table task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  child_id uuid not null references profiles(id) on delete cascade,
  completed_date date not null default current_date,
  duration_minutes integer,
  minutes_earned integer not null default 0,
  created_at timestamptz not null default now()
);

-- Prevent double-claiming of non-shared tasks on the same date
-- For daily/anytime non-shared tasks: one child per task per day
create unique index uq_nonshared_daily_completion
  on task_completions (task_id, completed_date)
  where exists (
    select 1 from tasks t
    where t.id = task_completions.task_id
      and t.is_shared = false
      and t.recurrence in ('daily', 'anytime')
  );

-- screen_time_usage
create table screen_time_usage (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id) on delete cascade,
  usage_date date not null default current_date,
  minutes_used integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);

-- balance_adjustments
create table balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id) on delete cascade,
  adjusted_by uuid not null references profiles(id),
  minutes integer not null,
  reason text,
  created_at timestamptz not null default now()
);

-- weekly_summaries
create table weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  minutes_earned integer not null default 0,
  minutes_used integer not null default 0,
  adjustments integer not null default 0,
  carryover_in integer not null default 0,
  raw_balance integer not null default 0,
  penalty integer not null default 0,
  carryover_out integer not null default 0,
  created_at timestamptz not null default now(),
  unique (child_id, week_start)
);

-- achievements
create table achievements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade, -- null = global
  name text not null,
  description text not null,
  icon text not null default '🏆',
  criteria_type text not null,
  criteria_value integer not null,
  created_at timestamptz not null default now()
);

-- child_achievements
create table child_achievements (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id) on delete cascade,
  achievement_id uuid not null references achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (child_id, achievement_id)
);

-- streaks
create table streaks (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_completed_date date,
  updated_at timestamptz not null default now(),
  unique (child_id, task_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_profiles_household on profiles(household_id);
create index idx_tasks_household on tasks(household_id);
create index idx_task_assignments_child on task_assignments(child_id);
create index idx_task_assignments_task on task_assignments(task_id);
create index idx_task_completions_child_date on task_completions(child_id, completed_date);
create index idx_task_completions_task_date on task_completions(task_id, completed_date);
create index idx_screen_time_child_date on screen_time_usage(child_id, usage_date);
create index idx_balance_adj_child on balance_adjustments(child_id);
create index idx_weekly_summaries_child on weekly_summaries(child_id, week_start);
create index idx_streaks_child on streaks(child_id);
create index idx_child_achievements_child on child_achievements(child_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on households
  for each row execute function update_updated_at();
create trigger set_updated_at before update on profiles
  for each row execute function update_updated_at();
create trigger set_updated_at before update on tasks
  for each row execute function update_updated_at();
create trigger set_updated_at before update on streaks
  for each row execute function update_updated_at();

-- ============================================================
-- HELPER: get the current week boundaries (Sunday–Saturday)
-- ============================================================

create or replace function current_week_start()
returns date as $$
  -- Sunday of the current week
  select current_date - extract(dow from current_date)::int;
$$ language sql stable;

create or replace function current_week_end()
returns date as $$
  select current_date - extract(dow from current_date)::int + 6;
$$ language sql stable;

-- ============================================================
-- FUNCTION: child_current_balance(child_id)
-- ============================================================

create or replace function child_current_balance(p_child_id uuid)
returns integer as $$
declare
  v_carryover integer;
  v_earned integer;
  v_used integer;
  v_adjustments integer;
  v_week_start date;
begin
  v_week_start := current_week_start();

  -- Most recent carryover_out, or 0
  select coalesce(
    (select ws.carryover_out
     from weekly_summaries ws
     where ws.child_id = p_child_id
     order by ws.week_start desc
     limit 1),
    0
  ) into v_carryover;

  -- Minutes earned this week
  select coalesce(sum(tc.minutes_earned), 0)
  into v_earned
  from task_completions tc
  where tc.child_id = p_child_id
    and tc.completed_date >= v_week_start
    and tc.completed_date <= current_date;

  -- Minutes used this week
  select coalesce(sum(stu.minutes_used), 0)
  into v_used
  from screen_time_usage stu
  where stu.child_id = p_child_id
    and stu.usage_date >= v_week_start
    and stu.usage_date <= current_date;

  -- Adjustments this week
  select coalesce(sum(ba.minutes), 0)
  into v_adjustments
  from balance_adjustments ba
  where ba.child_id = p_child_id
    and ba.created_at >= v_week_start::timestamptz
    and ba.created_at < (v_week_start + 7)::timestamptz;

  return v_carryover + v_earned - v_used + v_adjustments;
end;
$$ language plpgsql stable security definer;

-- ============================================================
-- FUNCTION: process_weekly_rollover()
-- Called by pg_cron at Sunday 00:00 UTC
-- ============================================================

create or replace function process_weekly_rollover()
returns void as $$
declare
  v_child record;
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
  -- The week that just ended: previous Sunday through Saturday
  v_week_start := current_date - extract(dow from current_date)::int - 7;
  v_week_end := v_week_start + 6;

  for v_child in
    select p.id as child_id
    from profiles p
    join households h on h.id = p.household_id
    where p.role = 'child'
      and p.is_active = true
      and h.is_paused = false
  loop
    -- Skip if summary already exists for this week
    if exists (
      select 1 from weekly_summaries
      where child_id = v_child.child_id and week_start = v_week_start
    ) then
      continue;
    end if;

    -- Carryover from prior week
    select coalesce(
      (select ws.carryover_out
       from weekly_summaries ws
       where ws.child_id = v_child.child_id
       order by ws.week_start desc
       limit 1),
      0
    ) into v_carryover_in;

    -- Earned
    select coalesce(sum(tc.minutes_earned), 0)
    into v_earned
    from task_completions tc
    where tc.child_id = v_child.child_id
      and tc.completed_date >= v_week_start
      and tc.completed_date <= v_week_end;

    -- Used
    select coalesce(sum(stu.minutes_used), 0)
    into v_used
    from screen_time_usage stu
    where stu.child_id = v_child.child_id
      and stu.usage_date >= v_week_start
      and stu.usage_date <= v_week_end;

    -- Adjustments
    select coalesce(sum(ba.minutes), 0)
    into v_adjustments
    from balance_adjustments ba
    where ba.child_id = v_child.child_id
      and ba.created_at >= v_week_start::timestamptz
      and ba.created_at < (v_week_end + 1)::timestamptz;

    v_raw_balance := v_carryover_in + v_earned - v_used + v_adjustments;

    if v_raw_balance < 0 then
      v_penalty := abs(v_raw_balance);
      v_carryover_out := v_raw_balance - v_penalty; -- doubles the deficit
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
end;
$$ language plpgsql security definer;

-- ============================================================
-- FUNCTION: check_and_award_achievements(child_id)
-- ============================================================

create or replace function check_and_award_achievements(p_child_id uuid)
returns void as $$
declare
  v_achievement record;
  v_household_id uuid;
  v_value integer;
begin
  select household_id into v_household_id
  from profiles where id = p_child_id;

  for v_achievement in
    select a.*
    from achievements a
    where (a.household_id = v_household_id or a.household_id is null)
      and not exists (
        select 1 from child_achievements ca
        where ca.child_id = p_child_id and ca.achievement_id = a.id
      )
  loop
    v_value := 0;

    case v_achievement.criteria_type
      when 'streak_days' then
        select coalesce(max(s.current_streak), 0)
        into v_value
        from streaks s
        where s.child_id = p_child_id;

      when 'total_earned' then
        select coalesce(sum(tc.minutes_earned), 0)
        into v_value
        from task_completions tc
        where tc.child_id = p_child_id;

      when 'tasks_completed' then
        select count(*)::int
        into v_value
        from task_completions tc
        where tc.child_id = p_child_id;

      when 'first_task' then
        select case when count(*) > 0 then 1 else 0 end
        into v_value
        from task_completions tc
        where tc.child_id = p_child_id;

      else
        continue;
    end case;

    if v_value >= v_achievement.criteria_value then
      insert into child_achievements (child_id, achievement_id)
      values (p_child_id, v_achievement.id)
      on conflict do nothing;
    end if;
  end loop;
end;
$$ language plpgsql security definer;

-- ============================================================
-- TRIGGER: auto-check achievements after task completion
-- ============================================================

create or replace function trigger_check_achievements()
returns trigger as $$
begin
  perform check_and_award_achievements(new.child_id);
  return new;
end;
$$ language plpgsql security definer;

create trigger after_task_completion
  after insert on task_completions
  for each row execute function trigger_check_achievements();

-- ============================================================
-- TRIGGER: enforce non-shared task uniqueness
-- (partial unique index on subquery not supported, use trigger)
-- ============================================================

create or replace function enforce_nonshared_task_limit()
returns trigger as $$
declare
  v_task tasks%rowtype;
  v_period_start date;
  v_period_end date;
begin
  select * into v_task from tasks where id = new.task_id;

  -- Only enforce for non-shared tasks
  if v_task.is_shared then
    return new;
  end if;

  -- Determine the period based on recurrence
  case v_task.recurrence
    when 'daily' then
      v_period_start := new.completed_date;
      v_period_end := new.completed_date;
    when 'weekly' then
      v_period_start := new.completed_date - extract(dow from new.completed_date)::int;
      v_period_end := v_period_start + 6;
    when 'anytime' then
      v_period_start := new.completed_date;
      v_period_end := new.completed_date;
  end case;

  -- Check if another child already completed this task in the period
  if exists (
    select 1 from task_completions tc
    where tc.task_id = new.task_id
      and tc.id != coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and tc.child_id != new.child_id
      and tc.completed_date >= v_period_start
      and tc.completed_date <= v_period_end
  ) then
    raise exception 'This task has already been claimed by another child for this period';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger enforce_nonshared_before_insert
  before insert on task_completions
  for each row execute function enforce_nonshared_task_limit();

-- Drop the partial index since the trigger handles this properly
drop index if exists uq_nonshared_daily_completion;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table households enable row level security;
alter table profiles enable row level security;
alter table tasks enable row level security;
alter table task_assignments enable row level security;
alter table task_completions enable row level security;
alter table screen_time_usage enable row level security;
alter table balance_adjustments enable row level security;
alter table weekly_summaries enable row level security;
alter table achievements enable row level security;
alter table child_achievements enable row level security;
alter table streaks enable row level security;

-- ============================================================
-- RLS HELPER: get the caller's profile
-- ============================================================

-- Get the household_id for the current auth user
create or replace function auth_household_id()
returns uuid as $$
  select household_id from profiles where id = auth.uid();
$$ language sql stable security definer;

-- Get the role for the current auth user
create or replace function auth_role()
returns member_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

-- ============================================================
-- RLS POLICIES: households
-- ============================================================

-- Members can view their own household
create policy "Members can view own household"
  on households for select
  using (id = auth_household_id());

-- Authenticated users can create a household (they become owner)
create policy "Authenticated users can create households"
  on households for insert
  with check (auth.uid() is not null);

-- Only owner can update household
create policy "Owner can update household"
  on households for update
  using (id = auth_household_id() and auth_role() = 'owner');

-- Only owner can delete household
create policy "Owner can delete household"
  on households for delete
  using (id = auth_household_id() and auth_role() = 'owner');

-- ============================================================
-- RLS POLICIES: profiles
-- ============================================================

-- Members can view profiles in their household
create policy "Members can view household profiles"
  on profiles for select
  using (household_id = auth_household_id());

-- Parents/owners can insert profiles (e.g., adding child accounts)
create policy "Parents can create profiles"
  on profiles for insert
  with check (
    household_id = auth_household_id()
    and auth_role() in ('owner', 'parent')
  );

-- Allow self-insert for new users joining (no profile yet)
create policy "New users can create own profile"
  on profiles for insert
  with check (id = auth.uid());

-- Parents/owners can update profiles in their household
create policy "Parents can update profiles"
  on profiles for update
  using (
    household_id = auth_household_id()
    and auth_role() in ('owner', 'parent')
  );

-- Users can update their own profile
create policy "Users can update own profile"
  on profiles for select
  using (id = auth.uid());

-- Owner can manage roles
create policy "Owner can delete profiles"
  on profiles for delete
  using (
    household_id = auth_household_id()
    and auth_role() = 'owner'
  );

-- ============================================================
-- RLS POLICIES: tasks
-- ============================================================

-- Members can view tasks in their household
create policy "Members can view household tasks"
  on tasks for select
  using (household_id = auth_household_id());

-- Parents/owners can create tasks
create policy "Parents can create tasks"
  on tasks for insert
  with check (
    household_id = auth_household_id()
    and auth_role() in ('owner', 'parent')
  );

-- Parents/owners can update tasks
create policy "Parents can update tasks"
  on tasks for update
  using (
    household_id = auth_household_id()
    and auth_role() in ('owner', 'parent')
  );

-- Parents/owners can delete tasks
create policy "Parents can delete tasks"
  on tasks for delete
  using (
    household_id = auth_household_id()
    and auth_role() in ('owner', 'parent')
  );

-- ============================================================
-- RLS POLICIES: task_assignments
-- ============================================================

-- Children see their own assignments; parents see all in household
create policy "View task assignments"
  on task_assignments for select
  using (
    child_id = auth.uid()
    or exists (
      select 1 from tasks t
      where t.id = task_assignments.task_id
        and t.household_id = auth_household_id()
        and auth_role() in ('owner', 'parent')
    )
  );

-- Parents/owners can manage assignments
create policy "Parents can manage assignments"
  on task_assignments for insert
  with check (
    exists (
      select 1 from tasks t
      where t.id = task_assignments.task_id
        and t.household_id = auth_household_id()
        and auth_role() in ('owner', 'parent')
    )
  );

create policy "Parents can delete assignments"
  on task_assignments for delete
  using (
    exists (
      select 1 from tasks t
      where t.id = task_assignments.task_id
        and t.household_id = auth_household_id()
        and auth_role() in ('owner', 'parent')
    )
  );

-- ============================================================
-- RLS POLICIES: task_completions
-- ============================================================

-- Children can view their own completions; parents can view all in household
create policy "View task completions"
  on task_completions for select
  using (
    child_id = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = task_completions.child_id
        and p.household_id = auth_household_id()
        and auth_role() in ('owner', 'parent')
    )
  );

-- Children can create their own completions (for assigned tasks)
create policy "Children can complete assigned tasks"
  on task_completions for insert
  with check (
    child_id = auth.uid()
    and exists (
      select 1 from task_assignments ta
      where ta.task_id = task_completions.task_id
        and ta.child_id = auth.uid()
    )
  );

-- Parents can create completions on behalf of children
create policy "Parents can create completions"
  on task_completions for insert
  with check (
    auth_role() in ('owner', 'parent')
    and exists (
      select 1 from profiles p
      where p.id = task_completions.child_id
        and p.household_id = auth_household_id()
    )
  );

-- ============================================================
-- RLS POLICIES: screen_time_usage
-- ============================================================

-- Children can view their own usage; parents can view all in household
create policy "View screen time usage"
  on screen_time_usage for select
  using (
    child_id = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = screen_time_usage.child_id
        and p.household_id = auth_household_id()
        and auth_role() in ('owner', 'parent')
    )
  );

-- Children can log their own screen time
create policy "Children can log screen time"
  on screen_time_usage for insert
  with check (child_id = auth.uid());

-- Parents can log/manage screen time for household children
create policy "Parents can manage screen time"
  on screen_time_usage for insert
  with check (
    auth_role() in ('owner', 'parent')
    and exists (
      select 1 from profiles p
      where p.id = screen_time_usage.child_id
        and p.household_id = auth_household_id()
    )
  );

create policy "Parents can update screen time"
  on screen_time_usage for update
  using (
    auth_role() in ('owner', 'parent')
    and exists (
      select 1 from profiles p
      where p.id = screen_time_usage.child_id
        and p.household_id = auth_household_id()
    )
  );

create policy "Parents can delete screen time"
  on screen_time_usage for delete
  using (
    auth_role() in ('owner', 'parent')
    and exists (
      select 1 from profiles p
      where p.id = screen_time_usage.child_id
        and p.household_id = auth_household_id()
    )
  );

-- ============================================================
-- RLS POLICIES: balance_adjustments
-- ============================================================

-- Children can view their own; parents can view all in household
create policy "View balance adjustments"
  on balance_adjustments for select
  using (
    child_id = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = balance_adjustments.child_id
        and p.household_id = auth_household_id()
        and auth_role() in ('owner', 'parent')
    )
  );

-- Only parents/owners can create adjustments
create policy "Parents can create adjustments"
  on balance_adjustments for insert
  with check (
    auth_role() in ('owner', 'parent')
    and adjusted_by = auth.uid()
    and exists (
      select 1 from profiles p
      where p.id = balance_adjustments.child_id
        and p.household_id = auth_household_id()
    )
  );

-- ============================================================
-- RLS POLICIES: weekly_summaries
-- ============================================================

-- Children can view their own; parents can view all in household
create policy "View weekly summaries"
  on weekly_summaries for select
  using (
    child_id = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = weekly_summaries.child_id
        and p.household_id = auth_household_id()
        and auth_role() in ('owner', 'parent')
    )
  );

-- Only the system (security definer functions) inserts summaries
-- No direct insert policy for users

-- ============================================================
-- RLS POLICIES: achievements
-- ============================================================

-- Members can view achievements for their household + global
create policy "View achievements"
  on achievements for select
  using (
    household_id is null
    or household_id = auth_household_id()
  );

-- Parents/owners can create household achievements
create policy "Parents can create achievements"
  on achievements for insert
  with check (
    household_id = auth_household_id()
    and auth_role() in ('owner', 'parent')
  );

-- Parents/owners can update/delete household achievements
create policy "Parents can update achievements"
  on achievements for update
  using (
    household_id = auth_household_id()
    and auth_role() in ('owner', 'parent')
  );

create policy "Parents can delete achievements"
  on achievements for delete
  using (
    household_id = auth_household_id()
    and auth_role() in ('owner', 'parent')
  );

-- ============================================================
-- RLS POLICIES: child_achievements
-- ============================================================

-- Children can view their own; parents can view all in household
create policy "View child achievements"
  on child_achievements for select
  using (
    child_id = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = child_achievements.child_id
        and p.household_id = auth_household_id()
        and auth_role() in ('owner', 'parent')
    )
  );

-- Only system (trigger) inserts — no direct user insert policy

-- ============================================================
-- RLS POLICIES: streaks
-- ============================================================

-- Children can view their own; parents can view all in household
create policy "View streaks"
  on streaks for select
  using (
    child_id = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = streaks.child_id
        and p.household_id = auth_household_id()
        and auth_role() in ('owner', 'parent')
    )
  );

-- Only system updates streaks — no direct user write policy

-- ============================================================
-- FUNCTION: update streak after task completion
-- ============================================================

create or replace function update_streak_on_completion()
returns trigger as $$
declare
  v_streak streaks%rowtype;
  v_expected_date date;
  v_recurrence recurrence_type;
begin
  select recurrence into v_recurrence from tasks where id = new.task_id;

  -- Get or create streak record
  select * into v_streak
  from streaks
  where child_id = new.child_id and task_id = new.task_id;

  if not found then
    insert into streaks (child_id, task_id, current_streak, longest_streak, last_completed_date)
    values (new.child_id, new.task_id, 1, 1, new.completed_date);
    return new;
  end if;

  -- Already counted this date
  if v_streak.last_completed_date = new.completed_date then
    return new;
  end if;

  -- Determine expected previous date for streak continuity
  case v_recurrence
    when 'daily' then
      v_expected_date := new.completed_date - 1;
    when 'weekly' then
      v_expected_date := new.completed_date - 7;
    else
      -- 'anytime' tasks: any completion extends streak if within 1 day
      v_expected_date := new.completed_date - 1;
  end case;

  if v_streak.last_completed_date = v_expected_date then
    -- Continue streak
    update streaks
    set current_streak = current_streak + 1,
        longest_streak = greatest(longest_streak, current_streak + 1),
        last_completed_date = new.completed_date
    where child_id = new.child_id and task_id = new.task_id;
  else
    -- Reset streak
    update streaks
    set current_streak = 1,
        last_completed_date = new.completed_date
    where child_id = new.child_id and task_id = new.task_id;
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger after_completion_update_streak
  after insert on task_completions
  for each row execute function update_streak_on_completion();

-- ============================================================
-- PG_CRON: Schedule weekly rollover (Sunday 00:00 UTC)
-- ============================================================

-- Note: pg_cron must be enabled in Supabase dashboard (Extensions).
-- This will be scheduled when the migration runs on a Supabase instance.
-- Uncomment the following line when pg_cron is available:
-- select cron.schedule('weekly-rollover', '0 0 * * 0', 'select process_weekly_rollover()');

-- ============================================================
-- SEED: Default global achievements
-- ============================================================

insert into achievements (household_id, name, description, icon, criteria_type, criteria_value) values
  (null, 'First Steps', 'Complete your first task!', '🌟', 'first_task', 1),
  (null, 'On a Roll', 'Complete a 3-day streak on any task', '🔥', 'streak_days', 3),
  (null, 'Week Warrior', 'Complete a 7-day streak on any task', '⚡', 'streak_days', 7),
  (null, 'Task Master', 'Complete 50 tasks total', '👑', 'tasks_completed', 50),
  (null, 'Century Club', 'Complete 100 tasks total', '💯', 'tasks_completed', 100),
  (null, 'Time Mogul', 'Earn 500 minutes total', '⏰', 'total_earned', 500),
  (null, 'Screen Time Tycoon', 'Earn 1000 minutes total', '🏆', 'total_earned', 1000);
