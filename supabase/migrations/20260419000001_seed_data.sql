-- ============================================================
-- ChorePoppin' Seed Data
-- ============================================================

-- ------------------------------------------------------------
-- Default global achievements
-- Replace any existing global achievements from initial migration
-- ------------------------------------------------------------

delete from achievements where household_id is null;

insert into achievements (household_id, name, description, icon, criteria_type, criteria_value) values
  (null, 'First Chore',    'Complete your first task!',          '🌟', 'first_task',    1),
  (null, 'On a Roll',      'Complete a 3-day streak on any task','🔥', 'streak_days',   3),
  (null, 'Streak Master',  'Complete a 7-day streak on any task','⚡', 'streak_days',   7),
  (null, 'Century Club',   'Earn 100 minutes total',             '💯', 'total_earned',  100),
  (null, 'Superstar',      'Earn 500 minutes total',             '🏆', 'total_earned',  500),
  (null, 'Marathon',       'Earn 1000 minutes total',            '👑', 'total_earned',  1000);

-- ------------------------------------------------------------
-- Suggested starter tasks
-- Library a parent can pick from when setting up a household.
-- ------------------------------------------------------------

create table suggested_tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default '✅',
  reward_type reward_type not null,
  reward_amount numeric(6,2) not null,
  recurrence recurrence_type not null,
  is_shared boolean not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table suggested_tasks enable row level security;

create policy "Anyone authenticated can view suggested tasks"
  on suggested_tasks for select
  using (auth.uid() is not null);

insert into suggested_tasks (name, icon, reward_type, reward_amount, recurrence, is_shared, sort_order) values
  ('Make Your Bed',      '🛏️', 'fixed',      5,    'daily',   true,  10),
  ('Empty Dishwasher',   '🍽️', 'fixed',      15,   'daily',   false, 20),
  ('Read',               '📚', 'per_minute', 0.5,  'anytime', true,  30),
  ('Outside Time',       '🌳', 'per_minute', 0.5,  'anytime', true,  40),
  ('Running/Exercise',   '🏃', 'per_minute', 1.0,  'anytime', true,  50),
  ('Pick Up Room',       '🧹', 'fixed',      10,   'daily',   true,  60),
  ('Take Out Trash',     '🗑️', 'fixed',      10,   'anytime', false, 70),
  ('Homework',           '✏️', 'per_minute', 0.5,  'daily',   true,  80);
