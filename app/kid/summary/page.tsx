import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "My week — ChorePop",
};

type WeeklySummary = {
  id: string;
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

export default async function KidSummaryPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const kidId = claimsData?.claims?.sub;
  if (!kidId) redirect("/login");

  const { data: latest } = await supabase
    .from("weekly_summaries")
    .select(
      "id, week_start, week_end, minutes_earned, minutes_used, adjustments, carryover_in, raw_balance, penalty, carryover_out",
    )
    .eq("child_id", kidId)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: history } = await supabase
    .from("weekly_summaries")
    .select("week_start, week_end, minutes_earned, minutes_used, carryover_out")
    .eq("child_id", kidId)
    .order("week_start", { ascending: false })
    .range(1, 5);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl">
          My week 📊
        </h1>
        <p className="text-muted-foreground mt-1">
          Your weekly report card. New summaries appear every Sunday.
        </p>
      </header>

      {latest ? (
        <ReportCard summary={latest as WeeklySummary} />
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="text-5xl mb-3" aria-hidden>📅</div>
            <p className="font-display font-bold text-lg mb-1">
              No summary yet
            </p>
            <p className="text-muted-foreground text-sm mb-5">
              Your first weekly summary will show up after Sunday rollover.
              Until then, keep earning!
            </p>
            <Button asChild size="lg">
              <Link href="/kid/tasks">Do a chore</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {history && history.length > 0 ? (
        <section>
          <h2 className="font-display font-bold text-xl mb-3">Past weeks</h2>
          <div className="flex flex-col gap-2">
            {history.map((row) => (
              <Card key={row.week_start}>
                <CardContent className="p-3 flex items-center gap-3 text-sm">
                  <div className="font-display font-semibold w-32 shrink-0">
                    {formatDate(row.week_start)} – {formatDate(row.week_end)}
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-positive font-display font-bold">
                        +{row.minutes_earned}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase">
                        earned
                      </div>
                    </div>
                    <div>
                      <div className="text-negative font-display font-bold">
                        −{row.minutes_used}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase">
                        used
                      </div>
                    </div>
                    <div>
                      <div
                        className={`font-display font-extrabold ${
                          row.carryover_out < 0 ? "text-negative" : "text-positive"
                        }`}
                      >
                        {row.carryover_out >= 0 ? "+" : ""}
                        {row.carryover_out}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase">
                        ended
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReportCard({ summary }: { summary: WeeklySummary }) {
  const wentNegative = summary.raw_balance < 0;
  const wentPositive = summary.carryover_out > 0;
  const tone = wentNegative
    ? "border-negative/40 bg-negative/10"
    : wentPositive
      ? "border-positive/40 bg-positive/10"
      : "border-border bg-card";

  const headline = wentNegative
    ? "Tough week — but you can bounce back!"
    : wentPositive
      ? "Awesome week!"
      : "Steady week — keep at it!";

  return (
    <div
      className={`rounded-lg border-2 ${tone} p-5 sm:p-6 shadow-pop-sm flex flex-col gap-5`}
    >
      <div>
        <div className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
          Week of {formatDate(summary.week_start)} – {formatDate(summary.week_end)}
        </div>
        <h2 className="font-display font-extrabold text-2xl mt-0.5">
          {headline}
        </h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Earned" value={summary.minutes_earned} tone="positive" />
        <Stat label="Used" value={-summary.minutes_used} tone="negative" />
        <Stat
          label="Adjustments"
          value={summary.adjustments}
          tone={summary.adjustments < 0 ? "negative" : "positive"}
        />
        <Stat label="Started with" value={summary.carryover_in} tone="muted" />
      </div>

      {summary.penalty > 0 ? (
        <div className="rounded-md bg-negative/10 border border-negative/30 p-3 text-sm">
          <div className="font-display font-bold">Penalty applied</div>
          <p className="text-muted-foreground text-xs mt-0.5">
            You ended the week at {summary.raw_balance} min. The penalty doubles
            the deficit, so {summary.penalty} extra min carry over as a deficit.
          </p>
        </div>
      ) : null}

      <div className="rounded-md bg-card border border-border/60 p-4 flex items-baseline justify-between">
        <span className="font-display font-bold">Carrying into next week</span>
        <span
          className={`font-display font-extrabold text-3xl ${
            summary.carryover_out < 0 ? "text-negative" : "text-positive"
          }`}
        >
          {summary.carryover_out >= 0 ? "+" : ""}
          {summary.carryover_out} min
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative" | "muted";
}) {
  const colors = {
    positive: "text-positive",
    negative: "text-negative",
    muted: "text-muted-foreground",
  } as const;
  return (
    <div className="bg-card rounded-md border border-border/60 p-3 text-center">
      <div className={`font-display font-extrabold text-xl ${colors[tone]}`}>
        {value > 0 ? "+" : ""}
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground font-display font-semibold uppercase tracking-wider mt-0.5">
        {label}
      </div>
    </div>
  );
}
