import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { levelFor } from "@/lib/levels";
import { DOW_LABELS, isoDate, startOfWeekUTC, weekDates } from "@/lib/week";

export const metadata = {
  title: "ChorePop",
};

export default async function KidDashboardPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const kidId = claimsData?.claims?.sub;
  if (!kidId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, household_id")
    .eq("id", kidId)
    .maybeSingle();

  if (!profile?.household_id) redirect("/login");

  const today = new Date();
  const weekStart = isoDate(startOfWeekUTC(today));
  const weekDays = weekDates(today);
  const todayIso = isoDate(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
  );

  const [
    balanceRes,
    lifetimeRes,
    streakRes,
    completionsThisWeek,
    usageThisWeek,
    siblings,
  ] = await Promise.all([
    supabase.rpc("child_current_balance", { p_child_id: kidId }),
    supabase
      .from("task_completions")
      .select("minutes_earned")
      .eq("child_id", kidId),
    supabase
      .from("streaks")
      .select("current_streak")
      .eq("child_id", kidId)
      .order("current_streak", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("task_completions")
      .select("completed_date, minutes_earned, child_id")
      .gte("completed_date", weekStart)
      .lte("completed_date", todayIso),
    supabase
      .from("screen_time_usage")
      .select("usage_date, minutes_used")
      .eq("child_id", kidId)
      .gte("usage_date", weekStart)
      .lte("usage_date", todayIso),
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("household_id", profile.household_id)
      .eq("role", "child")
      .eq("is_active", true),
  ]);

  const balance = (balanceRes.data as number | null) ?? 0;

  const lifetimeMinutes = (lifetimeRes.data ?? []).reduce(
    (sum, r) => sum + (r.minutes_earned ?? 0),
    0,
  );
  const level = levelFor(lifetimeMinutes);

  const bestStreak = streakRes.data?.current_streak ?? 0;

  const earnedByDay = new Map<string, number>();
  const usedByDay = new Map<string, number>();
  for (const row of completionsThisWeek.data ?? []) {
    if (row.child_id !== kidId) continue;
    earnedByDay.set(
      row.completed_date,
      (earnedByDay.get(row.completed_date) ?? 0) + (row.minutes_earned ?? 0),
    );
  }
  for (const row of usageThisWeek.data ?? []) {
    usedByDay.set(
      row.usage_date,
      (usedByDay.get(row.usage_date) ?? 0) + (row.minutes_used ?? 0),
    );
  }

  // Leaderboard: every kid's earned this week
  const earnedByKid = new Map<string, number>();
  for (const row of completionsThisWeek.data ?? []) {
    earnedByKid.set(
      row.child_id,
      (earnedByKid.get(row.child_id) ?? 0) + (row.minutes_earned ?? 0),
    );
  }
  const leaderboard = (siblings.data ?? [])
    .map((k) => ({
      id: k.id,
      display_name: k.display_name,
      avatar_url: k.avatar_url,
      earned: earnedByKid.get(k.id) ?? 0,
    }))
    .sort((a, b) => b.earned - a.earned);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl">
          Hey {profile.display_name}! 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {balance < 0
            ? "Time to earn back some screen time!"
            : balance < 30
              ? "Getting close. Knock out a chore?"
              : "You're crushing it. Keep going!"}
        </p>
      </header>

      <BalanceCard balance={balance} />

      <div className="grid grid-cols-3 gap-3">
        <QuickAction href="/kid/tasks" icon="✅" label="Do a Chore" tone="primary" />
        <QuickAction
          href="/kid/log"
          icon="📱"
          label="Use Time"
          tone="secondary"
        />
        <QuickAction
          href="/kid/achievements"
          icon="🏆"
          label="Badges"
          tone="accent"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <LevelCard
          lifetimeMinutes={lifetimeMinutes}
          level={level.current}
          next={level.next}
          percentToNext={level.percentToNext}
          minutesToNext={level.minutesToNext}
        />
        <StreakCard streak={bestStreak} />
      </div>

      <WeeklyChart days={weekDays} earned={earnedByDay} used={usedByDay} />

      {leaderboard.length > 1 ? (
        <Leaderboard rows={leaderboard} myId={kidId} />
      ) : null}
    </div>
  );
}

function BalanceCard({ balance }: { balance: number }) {
  const tone =
    balance < 0
      ? "border-negative/40 bg-negative/10"
      : balance < 30
        ? "border-accent/40 bg-accent/15"
        : "border-positive/40 bg-positive/15";
  const numColor =
    balance < 0
      ? "text-negative"
      : balance < 30
        ? "text-accent-foreground"
        : "text-positive";

  return (
    <div
      className={`rounded-lg border-2 ${tone} px-6 py-7 text-center shadow-pop-sm`}
    >
      <div className="text-sm font-display font-bold uppercase tracking-wider text-muted-foreground">
        Your Balance
      </div>
      <div
        className={`font-display font-extrabold text-6xl sm:text-7xl mt-1 ${numColor}`}
      >
        {balance >= 0 ? "+" : ""}
        {balance}
      </div>
      <div className="text-base font-display font-bold text-muted-foreground">
        screen-time minutes
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  tone,
}: {
  href: string;
  icon: string;
  label: string;
  tone: "primary" | "secondary" | "accent";
}) {
  const tones = {
    primary: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    accent: "bg-accent text-accent-foreground",
  } as const;
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-1 rounded-lg ${tones[tone]} shadow-pop-sm py-4 px-2 font-display font-bold text-sm transition-all hover:-translate-y-0.5 hover:shadow-pop active:scale-95`}
    >
      <span className="text-3xl" aria-hidden>
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}

function LevelCard({
  lifetimeMinutes,
  level,
  next,
  percentToNext,
  minutesToNext,
}: {
  lifetimeMinutes: number;
  level: { level: number; title: string };
  next: { level: number; title: string } | null;
  percentToNext: number;
  minutesToNext: number;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
          Level {level.level}
        </div>
        <div className="font-display font-extrabold text-2xl">{level.title}</div>
        <div className="mt-3 h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${percentToNext}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          {next
            ? `${minutesToNext} min to ${next.title}`
            : `Maxed out — ${lifetimeMinutes} lifetime min`}
        </div>
      </CardContent>
    </Card>
  );
}

function StreakCard({ streak }: { streak: number }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <span
          className={`text-5xl ${streak > 0 ? "animate-flame-pulse" : "opacity-50"}`}
          aria-hidden
        >
          🔥
        </span>
        <div className="flex-1">
          <div className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
            Best Streak
          </div>
          <div className="font-display font-extrabold text-2xl">
            {streak} {streak === 1 ? "day" : "days"}
          </div>
          <div className="text-xs text-muted-foreground">
            {streak > 0 ? "Keep it going!" : "Start one today!"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WeeklyChart({
  days,
  earned,
  used,
}: {
  days: string[];
  earned: Map<string, number>;
  used: Map<string, number>;
}) {
  const max = Math.max(
    1,
    ...days.map((d) => Math.max(earned.get(d) ?? 0, used.get(d) ?? 0)),
  );

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display font-bold text-lg">This week</h2>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-positive" />
              earned
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-negative/60" />
              used
            </span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2 items-end h-32">
          {days.map((day, i) => {
            const e = earned.get(day) ?? 0;
            const u = used.get(day) ?? 0;
            return (
              <div
                key={day}
                className="flex flex-col items-center gap-1 h-full justify-end"
              >
                <div className="flex items-end gap-0.5 h-full w-full justify-center">
                  <div
                    className="w-3 rounded-t bg-positive"
                    style={{ height: `${(e / max) * 100}%` }}
                    title={`${e} earned`}
                  />
                  <div
                    className="w-3 rounded-t bg-negative/60"
                    style={{ height: `${(u / max) * 100}%` }}
                    title={`${u} used`}
                  />
                </div>
                <div className="text-[10px] font-display font-semibold text-muted-foreground">
                  {DOW_LABELS[i]}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Leaderboard({
  rows,
  myId,
}: {
  rows: Array<{
    id: string;
    display_name: string;
    avatar_url: string | null;
    earned: number;
  }>;
  myId: string;
}) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="font-display font-bold text-lg mb-3">Leaderboard</h2>
        <ul className="flex flex-col gap-2">
          {rows.map((row, i) => {
            const isMe = row.id === myId;
            return (
              <li
                key={row.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-md ${
                  isMe ? "bg-primary/10 border border-primary/30" : "bg-muted/40"
                }`}
              >
                <span className="text-xl w-6 text-center" aria-hidden>
                  {medals[i] ?? `#${i + 1}`}
                </span>
                <span className="text-2xl" aria-hidden>
                  {row.avatar_url ?? "🙂"}
                </span>
                <span className="font-display font-bold flex-1 truncate">
                  {row.display_name}
                  {isMe ? <span className="text-muted-foreground"> · you</span> : null}
                </span>
                <span className="font-display font-extrabold text-positive">
                  {row.earned} min
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
