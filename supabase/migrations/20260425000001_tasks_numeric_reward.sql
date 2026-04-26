-- ============================================================
-- Align tasks.reward_amount with suggested_tasks (numeric).
--
-- The original schema typed reward_amount as integer, but the seed
-- data for `suggested_tasks` (Read, Outside Time, Homework) uses
-- 0.5 — i.e. half a minute earned per minute spent. Rounding loses
-- the rate, so promote the column to numeric(6,2). minutes_earned
-- on task_completions stays integer and gets floored at insert time.
-- ============================================================

alter table tasks
  alter column reward_amount type numeric(6,2)
  using reward_amount::numeric(6,2);
