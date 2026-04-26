-- ============================================================
-- Broaden read-visibility on task_completions and streaks so kids
-- in the same household can see each other.
--
-- Why: the M5 kid surfaces need this for two features —
--   1. Sibling-lock detection on /kid/tasks (a non-shared task
--      already claimed today by another kid in the same household
--      must show as locked — the SELECT against task_completions
--      previously hit the RLS wall and returned nothing).
--   2. The household leaderboard on the kid dashboard (sums every
--      kid's minutes_earned this week — same RLS wall produced an
--      all-zeros leaderboard for everyone but yourself).
--
-- New rule: any household member (including children) can read any
-- task_completion or streak whose child belongs to their household.
-- screen_time_usage and balance_adjustments stay parent-or-self only
-- so kids don't see each other's screen-time logs.
-- ============================================================

drop policy if exists "View task completions" on task_completions;

create policy "View task completions"
  on task_completions for select
  using (
    exists (
      select 1 from profiles p
      where p.id = task_completions.child_id
        and p.household_id = auth_household_id()
    )
  );

drop policy if exists "View streaks" on streaks;

create policy "View streaks"
  on streaks for select
  using (
    exists (
      select 1 from profiles p
      where p.id = streaks.child_id
        and p.household_id = auth_household_id()
    )
  );
