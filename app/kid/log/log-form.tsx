"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logScreenTime } from "../actions";

const NOTE_CHIPS = ["iPad", "TV", "Computer", "Phone", "Game", "Other"];

export function LogScreenTimeForm({ balance }: { balance: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [minutes, setMinutes] = useState(15);
  const [note, setNote] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    | { kind: "ok"; message: string; newBalance: number }
    | { kind: "err"; message: string }
    | null
  >(null);

  const projectedBalance = useMemo(() => balance - minutes, [balance, minutes]);

  function bump(delta: number) {
    setMinutes((m) => Math.max(1, Math.min(24 * 60, m + delta)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await logScreenTime({ minutes, note });
      if (!res.ok) {
        setFeedback({ kind: "err", message: res.error });
        return;
      }
      setFeedback({
        kind: "ok",
        message: `−${minutes} min logged.`,
        newBalance: balance - minutes,
      });
      setMinutes(15);
      setNote(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="text-center">
            <div className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
              Current balance
            </div>
            <div
              className={`font-display font-extrabold text-3xl ${
                balance < 0 ? "text-negative" : "text-positive"
              }`}
            >
              {balance >= 0 ? "+" : ""}
              {balance} min
            </div>
          </div>

          <div className="flex flex-col gap-2 items-center">
            <span className="font-display font-semibold text-sm text-muted-foreground">
              How many minutes did you use?
            </span>
            <div className="flex items-center gap-2 justify-center flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => bump(-15)}
                aria-label="minus 15"
              >
                −15
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => bump(-5)}
                aria-label="minus 5"
              >
                −5
              </Button>
              <div className="font-display font-extrabold text-5xl tabular-nums w-24 text-center">
                {minutes}
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => bump(5)}
                aria-label="plus 5"
              >
                +5
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => bump(15)}
                aria-label="plus 15"
              >
                +15
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              After logging:{" "}
              <span
                className={`font-display font-extrabold ${
                  projectedBalance < 0 ? "text-negative" : "text-foreground"
                }`}
              >
                {projectedBalance >= 0 ? "+" : ""}
                {projectedBalance} min
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-display font-semibold text-sm">
              What did you use? <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {NOTE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setNote(note === chip ? null : chip)}
                  aria-pressed={note === chip}
                  className={`px-3 h-9 rounded-full border-2 text-sm font-display font-bold transition-all active:scale-95 ${
                    note === chip
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {feedback ? (
            <div
              role="status"
              className={`rounded-md p-3 text-sm border ${
                feedback.kind === "ok"
                  ? "bg-positive/10 border-positive/30 text-foreground"
                  : "bg-negative/10 border-negative/30 text-foreground"
              }`}
            >
              {feedback.kind === "ok"
                ? `${feedback.message} New balance: ${feedback.newBalance} min.`
                : feedback.message}
            </div>
          ) : null}

          <Button type="submit" size="xl" disabled={pending}>
            {pending ? "Logging…" : `Log ${minutes} min`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
