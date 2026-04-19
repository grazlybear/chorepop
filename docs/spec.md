# ChorePop — Claude Code Development Prompt

## Overview

ChorePop is a family chore-and-screen-time management app. Kids complete tasks and chores to earn screen time (in minutes). They spend screen time by logging usage. The system tracks a running weekly balance with a carryover/penalty mechanic. Parents manage tasks, approve configurations, and monitor progress. The app is gamified and designed for young children (big buttons, avatars, minimal text).

**Tech stack:** Next.js (TypeScript) on Vercel, Supabase (Postgres + Auth), Tailwind CSS. Designed with a future React Native iOS app in mind.

---

## PHASE 1 — Database Schema & Supabase Setup

Create the full Supabase schema (migrations) for the following data model. Use Row Level Security (RLS) on every table. Use UUIDs for all primary keys. Add created_at/updated_at timestamps on every table.

### Tables

#### `households`

- `id` (UUID, PK)
- `name` (text, e.g. "The Smith Family")
- `created_by` (UUID, FK → profiles.id) — the owner
- `invite_code` (text, unique) — short alphanumeric code for joining
- `is_paused` (boolean, default false) — vacation mode, no penalties accrue
- `created_at`, `updated_at`

#### `profiles`

- `id` (UUID, PK) — matches Supabase auth.users.id for parents; generated for kids
- `household_id` (UUID, FK → households.id)
- `display_name` (text)
- `avatar_url` (text, nullable) — emoji or image reference
- `role` (enum: 'owner', 'parent', 'child')
- `pin_hash` (text, nullable) — hashed 4-digit PIN for child login
- `is_active` (boolean, default true)
- `created_at`, `updated_at`

#### `tasks`

- `id` (UUID, PK)
- `household_id` (UUID, FK → households.id)
- `name` (text, e.g. "Make Your Bed", "Go Running")
- `description` (text, nullable) — short kid-friendly description
- `icon` (text) — emoji or icon identifier
- `reward_type` (enum: 'fixed', 'per_minute')
- `reward_amount` (integer) — for fixed: total minutes earned; for per_minute: minutes earned per minute of activity
- `recurrence` (enum: 'daily', 'weekly', 'anytime')
- `is_shared` (boolean, default true) — if true, multiple kids can each claim this task (e.g. "make your bed"); if false, only one kid can claim per instance (e.g. "empty the dishwasher")
- `max_daily_minutes` (integer, nullable) — for per_minute tasks, parent-set cap per child per day
- `is_active` (boolean, default true)
- `created_by` (UUID, FK → profiles.id)
- `created_at`, `updated_at`

#### `task_assignments`

- `id` (UUID, PK)
- `task_id` (UUID, FK → tasks.id)
- `child_id` (UUID, FK → profiles.id)
- `created_at`

This is the join table that controls which kids can see and claim which tasks. If a child has no row here for a given task, they cannot see it.

#### `task_completions`

- `id` (UUID, PK)
- `task_id` (UUID, FK → tasks.id)
- `child_id` (UUID, FK → profiles.id)
- `completed_date` (date) — the calendar date of completion
- `duration_minutes` (integer, nullable) — for per_minute tasks, how long the child spent
- `minutes_earned` (integer) — calculated: fixed reward_amount, or duration × rate (capped by max_daily_minutes)
- `created_at`

Add a unique constraint or logic to prevent double-claiming of non-shared tasks on the same day/week depending on recurrence.

#### `screen_time_usage`

- `id` (UUID, PK)
- `child_id` (UUID, FK → profiles.id)
- `usage_date` (date)
- `minutes_used` (integer)
- `note` (text, nullable) — e.g. "iPad", "TV"
- `created_at`

#### `balance_adjustments`

- `id` (UUID, PK)
- `child_id` (UUID, FK → profiles.id)
- `adjusted_by` (UUID, FK → profiles.id) — the parent who made the adjustment
- `minutes` (integer) — positive or negative
- `reason` (text, nullable) — e.g. "Birthday bonus", "Correction"
- `created_at`

#### `weekly_summaries`

- `id` (UUID, PK)
- `child_id` (UUID, FK → profiles.id)
- `week_start` (date) — Sunday
- `week_end` (date) — Saturday
- `minutes_earned` (integer)
- `minutes_used` (integer)
- `adjustments` (integer)
- `carryover_in` (integer) — balance carried in from prior week
- `raw_balance` (integer) — carryover_in + earned - used + adjustments
- `penalty` (integer, default 0) — if raw_balance < 0, penalty = abs(raw_balance) (so effective = raw_balance - penalty = 2× the deficit)
- `carryover_out` (integer) — the balance carried to next week (raw_balance - penalty if negative, else raw_balance)
- `created_at`

#### `achievements`

- `id` (UUID, PK)
- `household_id` (UUID, FK → households.id, nullable) — null for global/system achievements
- `name` (text)
- `description` (text)
- `icon` (text) — emoji or image
- `criteria_type` (text) — e.g. 'streak_days', 'total_earned', 'tasks_completed', 'first_task'
- `criteria_value` (integer) — threshold to unlock
- `created_at`

#### `child_achievements`

- `id` (UUID, PK)
- `child_id` (UUID, FK → profiles.id)
- `achievement_id` (UUID, FK → achievements.id)
- `unlocked_at` (timestamp)

#### `streaks`

- `id` (UUID, PK)
- `child_id` (UUID, FK → profiles.id)
- `task_id` (UUID, FK → tasks.id)
- `current_streak` (integer, default 0)
- `longest_streak` (integer, default 0)
- `last_completed_date` (date)
- `updated_at`

### Views / Functions

Create a Postgres function or view `child_current_balance(child_id UUID)` that computes:

1. Get the most recent `weekly_summaries.carryover_out` for the child (if any), else 0.
2. Add all `task_completions.minutes_earned` for the current week (Sunday–today).
3. Subtract all `screen_time_usage.minutes_used` for the current week.
4. Add all `balance_adjustments.minutes` for the current week.
5. Return the result as the current running balance.

Create a Postgres function `process_weekly_rollover()` that:

1. For each active child in non-paused households:
   - Compute the week's earned, used, adjustments, and carryover_in.
   - If the balance is negative, apply penalty = abs(balance), so carryover_out = balance × 2.
   - If the balance is positive, carryover_out = balance.
   - Insert a row into `weekly_summaries`.
2. This will be triggered by a Supabase cron job (pg_cron) at midnight Saturday (or Sunday 00:00 in the household's timezone if we add timezone support later — for v1, use UTC or a fixed timezone).

Create a function `check_and_award_achievements(child_id UUID)` that runs after task completions and checks if any new achievements should be unlocked.

### Row Level Security Policies

- Household members can only read/write data within their own household.
- Children can read their own tasks (via task_assignments), create task_completions for themselves, read their own balance/achievements, and create screen_time_usage for themselves.
- Parents/owners can read and write all data within their household.
- The owner role can manage household settings and member roles.

### Seed Data

Create seed data with:

- A set of default achievements: "First Chore" (first task completed), "On a Roll" (3-day streak), "Streak Master" (7-day streak), "Century Club" (100 total minutes earned), "Superstar" (500 total minutes earned), "Marathon" (1000 total minutes earned).
- A set of suggested starter tasks a parent can pick from when setting up their household: "Make Your Bed" (fixed, 5 min, daily, shared), "Empty Dishwasher" (fixed, 15 min, daily, not shared), "Read" (per_minute, 0.5 rate, anytime, shared), "Outside Time" (per_minute, 0.5 rate, anytime, shared), "Running/Exercise" (per_minute, 1.0 rate, anytime, shared), "Pick Up Room" (fixed, 10 min, daily, shared), "Take Out Trash" (fixed, 10 min, anytime, not shared), "Homework" (per_minute, 0.5 rate, daily, shared).

---

## PHASE 2 — Next.js Web Application

### Auth System

Use Supabase Auth with social providers (Google, Apple) for parents. When a parent creates an account, they also create a household and become the owner.

For kids: implement a household-scoped PIN login. The flow is:

1. On the login screen, show options: "I'm a Parent" (social login) and "I'm a Kid" (PIN login).
2. For kid login: enter household invite code (or select household if remembered on device) → select avatar/name from the list of kids in that household → enter 4-digit PIN.
3. The app issues a session token (could be a Supabase custom JWT via an edge function, or a simple app-level session stored in a cookie). Keep the kid's session alive for the day so they don't have to re-enter the PIN constantly.

### App Structure & Routes

```
/ — Landing page (marketing, public)
/login — Auth page (parent social login + kid PIN login)
/kid — Kid dashboard (protected, child role)
/kid/tasks — Available tasks to claim
/kid/log — Log screen time usage
/kid/achievements — Badges and streaks
/kid/summary — Weekly summary
/parent — Parent dashboard (protected, parent/owner role)
/parent/tasks — Manage tasks (CRUD + assignments)
/parent/kids — Manage kids (add, edit, view balances)
/parent/household — Household settings (invite code, pause, roles)
/parent/summary — Weekly summaries for all kids
```

### Kid Experience

#### Kid Dashboard (`/kid`)

- Large, friendly greeting: "Hey [Name]! 👋"
- Prominent balance display: a large, animated number showing current screen time balance in minutes. Use a visual metaphor — like a battery, jar filling up, or coin stack — that fills/empties proportionally. Green when positive, yellow when low, red when negative.
- Quick action buttons (large, tappable, icon-heavy): "Do a Chore ✅", "Use Screen Time 📱", "My Badges 🏆"
- A small streak flame icon if they have any active streaks, showing their best current streak.
- Weekly mini-chart: a simple bar chart or sparkline showing earned vs. used per day this week.

#### Task List (`/kid/tasks`)

- Show only tasks assigned to this child via task_assignments.
- Each task is a large card with: icon, name, short reward description ("Earn 15 min" or "Earn 1 min per minute"), and a big "Claim" button.
- For per_minute tasks, tapping "Claim" opens a simple number input: "How many minutes did you spend?" with +/- buttons and a submit button. Enforce max_daily_minutes if set.
- For fixed tasks, tapping "Claim" immediately logs the completion and shows a celebration animation (confetti, pop, etc.) with the minutes earned.
- Gray out / hide tasks that are non-shared and already claimed by a sibling today.
- Gray out / mark as completed tasks the child has already done today (for daily tasks) or this week (for weekly tasks).

#### Log Screen Time (`/kid/log`)

- Simple interface: "How many minutes of screen time did you use?"
- Big number input with +/- buttons (increment by 5 or 15).
- Optional note field with quick-select chips: "iPad", "TV", "Computer", "Phone".
- Submit button that deducts from balance with a visual animation of the balance going down.

#### Achievements (`/kid/achievements`)

- Grid of badge cards. Unlocked ones are colorful with the unlock date. Locked ones are grayed out with a progress indicator (e.g., "3/7 day streak").
- Streaks section showing active streaks with fire emoji and count.

#### Weekly Summary (`/kid/summary`)

- Shown automatically on first login of a new week if a summary exists.
- Fun visual report card: earned, used, bonus/penalties, new balance.
- Show any new achievements unlocked.
- Positive/encouraging tone regardless of outcome.

### Parent Experience

#### Parent Dashboard (`/parent`)

- Overview cards for each child: name, avatar, current balance, today's completed tasks count, active streaks.
- Quick links to manage tasks and household.
- Alert banner if any child is in the negative.

#### Manage Tasks (`/parent/tasks`)

- List all household tasks with edit/delete/toggle active.
- Create task form: name, icon picker (emoji), reward type (fixed or per-minute), reward amount, recurrence (daily/weekly/anytime), shared toggle, max daily minutes (for per-minute), and checkboxes for which kids this task is assigned to.
- Option to pick from suggested starter tasks during initial setup.

#### Manage Kids (`/parent/kids`)

- List of kids with avatar, name, current balance, PIN management (reset PIN).
- Add kid: set display name, pick avatar, set PIN.
- Manual balance adjustment: enter + or - minutes with a reason.

#### Household Settings (`/parent/household`)

- Display and regenerate invite code.
- Toggle vacation/pause mode.
- Manage members (other parents/caretakers): view, change roles, remove.

#### Weekly Summaries (`/parent/summary`)

- Summary cards for each child for the past week.
- Comparison view: simple table or chart comparing kids' earned/used/balance.

### Design Direction

**Aesthetic:** Playful, bubbly, and colorful — think Duolingo meets a piggy bank app. Rounded corners everywhere. Soft shadows. Bouncy animations on interactions.

**Color palette:**

- Primary: a warm, energetic coral/orange
- Secondary: a calming teal/mint
- Accent: golden yellow for rewards and celebrations
- Positive balance: green tones
- Negative balance: soft red (not scary)
- Background: warm off-white with subtle texture

**Typography:** Use a rounded, friendly sans-serif for headings (like Nunito, Quicksand, or Baloo 2). Clean readable font for body text.

**Key interactions:**

- Confetti burst when earning screen time
- Coin/pop sound effect option (can be muted)
- Balance counter animates like an odometer when it changes
- Cards have a subtle bounce on tap/hover
- Streaks pulse with a flame animation
- Achievements unlock with a "level up" style animation

**Responsiveness:** Mobile-first. The primary use case is kids on an iPad or phone. Ensure all tap targets are at least 48px. Parent views should also work well on desktop.

### Gamification — Level System

Define a level system based on total lifetime minutes earned:

| Level | Title               | Min Earned |
| ----- | ------------------- | ---------- |
| 1     | Rookie              | 0          |
| 2     | Helper              | 50         |
| 3     | Star                | 150        |
| 4     | Champion            | 400        |
| 5     | Superstar           | 800        |
| 6     | Legend              | 1500       |
| 7     | Hero                | 3000       |
| 8     | Master              | 5000       |
| 9     | Grand Master        | 10000      |
| 10    | ChorePop King/Queen | 20000      |

Show the level and a progress bar toward the next level on the kid dashboard.

### Leaderboard

On the kid dashboard (or a sub-page), show a simple household leaderboard:

- Ranked by minutes earned this week.
- Show avatar, name, minutes earned, and rank (🥇🥈🥉 for top 3).
- Keep it fun and lighthearted — everyone gets a "title" even in last place.

---

## PHASE 3 — Supabase Edge Functions & Cron

### Weekly Rollover Cron

- Set up a Supabase pg_cron job to call `process_weekly_rollover()` at Sunday 00:00 UTC.
- The function should be idempotent — if a summary already exists for that week + child, skip.

### Achievement Checker

- Create a database trigger or edge function that fires after INSERT on `task_completions`.
- It calls `check_and_award_achievements()` for the relevant child.
- Also updates the `streaks` table: increment current_streak if last_completed_date was yesterday (or today for first completion); reset to 1 if there's a gap; update longest_streak if current exceeds it.

---

## Implementation Notes

- Keep all business logic in Supabase (Postgres functions + RLS) so the future React Native app can share the same backend.
- Use Supabase realtime subscriptions on the kid dashboard so if a parent makes an adjustment, the kid sees it update live.
- For the invite code system, generate a short 6-character alphanumeric code. Validate uniqueness.
- Store kid PINs as hashed values (bcrypt via a Supabase edge function).
- All times/dates should be stored in UTC. For v1, assume a single timezone per household (default to America/Denver, configurable later).
- Use Next.js App Router with server components where possible and client components for interactive elements.
- Use Supabase JS client library (@supabase/supabase-js) and the Next.js Supabase auth helpers.

---

## Future Enhancements (Do Not Build Yet)

- Push notifications when tasks are completed (parent) or when balance is low (child)
- Timer feature for duration tasks
- Parent approval workflow for task completions
- Household timezone configuration
- React Native iOS app
- Task photos (kid uploads proof of completion)
- Custom achievements created by parents
- Team tasks (two kids do a task together for bonus)
- Screen time scheduling (can only use screen time during certain hours)
