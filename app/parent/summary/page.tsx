import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Summary — ChorePop",
};

type WeeklySummaryRow = {
  child_id: string;
  week_start: string;
  week_end: string;
  minutes_earned: number;
  minutes_used: number;
  adjustments: number;
  carryover_in: number;
  raw_balance: number;
  penalty: number;
  carryover_out: number;
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function ParentSummaryPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.household_id) redirect("/onboarding");

  const { data: kidsData } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("household_id", profile.household_id)
    .eq("role", "child")
    .eq("is_active", true)
    .order("display_name");

  type Kid = { id: string; display_name: string; avatar_url: string | null };
  const kids = (kidsData ?? []) as Kid[];

  // Pull the latest summary per kid (a single fetch per kid keeps things simple).
  const latestEntries = await Promise.all(
    kids.map(async (k) => {
      const { data } = await supabase
        .from("weekly_summaries")
        .select(
          "child_id, week_start, week_end, minutes_earned, minutes_used, adjustments, carryover_in, raw_balance, penalty, carryover_out",
        )
        .eq("child_id", k.id)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      return [k.id, data as WeeklySummaryRow | null] as const;
    }),
  );
  const latestByKid = new Map(latestEntries);

  // Pull the most recent week_start across the household for the comparison
  // table — it's the single week that appears in everyone's "latest" row.
  const referenceWeek = Array.from(latestByKid.values())
    .filter((s): s is WeeklySummaryRow => s !== null)
    .map((s) => s.week_start)
    .sort()
    .pop();

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl">Summary</h1>
        <p className="text-muted-foreground mt-1">
          Last week&apos;s rollover for each kid. New summaries land Sunday at midnight UTC.
        </p>
      </header>

      {kids.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Add a kid to see weekly summaries.
          </CardContent>
        </Card>
      ) : null}

      {kids.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2">
          {kids.map((kid) => (
            <KidSummaryCard
              key={kid.id}
              kid={kid}
              summary={latestByKid.get(kid.id) ?? null}
            />
          ))}
        </section>
      ) : null}

      {referenceWeek && kids.length > 1 ? (
        <ComparisonTable
          weekStart={referenceWeek}
          rows={kids
            .map((kid) => {
              const s = latestByKid.get(kid.id);
              if (!s || s.week_start !== referenceWeek) return null;
              return { kid, summary: s };
            })
            .filter((r): r is { kid: Kid; summary: WeeklySummaryRow } => r !== null)}
        />
      ) : null}
    </div>
  );
}

function KidSummaryCard({
  kid,
  summary,
}: {
  kid: { id: string; display_name: string; avatar_url: string | null };
  summary: WeeklySummaryRow | null;
}) {
  if (!summary) {
    return (
      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="text-4xl shrink-0" aria-hidden>
            {kid.avatar_url ?? "🙂"}
          </div>
          <div className="flex-1">
            <div className="font-display font-bold text-lg">{kid.display_name}</div>
            <div className="text-sm text-muted-foreground">
              No summary yet — first one runs after Sunday.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const tone =
    summary.carryover_out < 0
      ? "border-negative/40"
      : summary.carryover_out > 0
        ? "border-positive/40"
        : "border-border";

  return (
    <Card className={`border-2 ${tone}`}>
      <CardContent className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="text-4xl shrink-0" aria-hidden>
            {kid.avatar_url ?? "🙂"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-lg truncate">
              {kid.display_name}
            </div>
            <div className="text-xs text-muted-foreground">
              Week of {formatDate(summary.week_start)} – {formatDate(summary.week_end)}
            </div>
          </div>
          <div
            className={`font-display font-extrabold text-2xl ${
              summary.carryover_out < 0 ? "text-negative" : "text-positive"
            }`}
          >
            {summary.carryover_out >= 0 ? "+" : ""}
            {summary.carryover_out}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <Cell label="Earned" value={`+${summary.minutes_earned}`} tone="positive" />
          <Cell label="Used" value={`−${summary.minutes_used}`} tone="negative" />
          <Cell
            label="Adjust"
            value={`${summary.adjustments >= 0 ? "+" : ""}${summary.adjustments}`}
            tone={summary.adjustments < 0 ? "negative" : "muted"}
          />
        </div>
        {summary.penalty > 0 ? (
          <div className="text-xs rounded-md bg-negative/10 border border-negative/30 p-2">
            Penalty: −{summary.penalty} min (raw {summary.raw_balance} → carry {summary.carryover_out})
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "muted";
}) {
  const colors = {
    positive: "text-positive",
    negative: "text-negative",
    muted: "text-foreground",
  } as const;
  return (
    <div className="bg-muted/30 rounded-md py-1.5">
      <div className={`font-display font-extrabold ${colors[tone]}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

function ComparisonTable({
  weekStart,
  rows,
}: {
  weekStart: string;
  rows: Array<{
    kid: { id: string; display_name: string; avatar_url: string | null };
    summary: WeeklySummaryRow;
  }>;
}) {
  const maxEarned = Math.max(1, ...rows.map((r) => r.summary.minutes_earned));

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="font-display font-bold text-xl">
          Side-by-side ({formatDate(weekStart)})
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Bars show minutes earned this week.
        </p>
        <div className="flex flex-col gap-2.5">
          {rows
            .sort((a, b) => b.summary.minutes_earned - a.summary.minutes_earned)
            .map(({ kid, summary }) => {
              const percent = Math.round(
                (summary.minutes_earned / maxEarned) * 100,
              );
              return (
                <div key={kid.id} className="flex items-center gap-3">
                  <span className="text-2xl shrink-0" aria-hidden>
                    {kid.avatar_url ?? "🙂"}
                  </span>
                  <span className="font-display font-semibold w-28 truncate text-sm">
                    {kid.display_name}
                  </span>
                  <div className="flex-1 h-6 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-positive flex items-center justify-end px-2"
                      style={{ width: `${Math.max(percent, 4)}%` }}
                    >
                      {percent > 30 ? (
                        <span className="text-xs font-display font-bold text-positive-foreground">
                          {summary.minutes_earned}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {percent <= 30 ? (
                    <span className="text-sm font-display font-extrabold text-positive w-12 text-right">
                      {summary.minutes_earned}
                    </span>
                  ) : null}
                </div>
              );
            })}
        </div>
      </CardContent>
    </Card>
  );
}
