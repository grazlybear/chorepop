"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { claimTask } from "../actions";

export type KidTaskCard = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  reward_type: "fixed" | "per_minute";
  reward_amount: number;
  recurrence: "daily" | "weekly" | "anytime";
  is_shared: boolean;
  max_daily_minutes: number | null;
  /** For per_minute tasks: minutes still earnable today (max_daily - already_earned). */
  remaining_cap: number | null;
  earned_today: number;
  locked_reason: string | null;
};

type Toast = { kind: "win"; message: string } | { kind: "fail"; message: string };

export function TaskBoard({ cards }: { cards: KidTaskCard[] }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeMinuteCard, setActiveMinuteCard] = useState<KidTaskCard | null>(null);

  return (
    <>
      {toast ? (
        <ToastBanner
          toast={toast}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <div className="grid gap-3">
        {cards.map((card) => (
          <TaskCard
            key={card.id}
            card={card}
            onPickPerMinute={() => setActiveMinuteCard(card)}
            onResult={setToast}
          />
        ))}
      </div>

      {activeMinuteCard ? (
        <PerMinuteDialog
          card={activeMinuteCard}
          onClose={() => setActiveMinuteCard(null)}
          onResult={(t) => {
            setActiveMinuteCard(null);
            setToast(t);
          }}
        />
      ) : null}
    </>
  );
}

function TaskCard({
  card,
  onPickPerMinute,
  onResult,
}: {
  card: KidTaskCard;
  onPickPerMinute: () => void;
  onResult: (t: Toast) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const locked = !!card.locked_reason;

  function claim() {
    if (locked) return;
    if (card.reward_type === "per_minute") {
      onPickPerMinute();
      return;
    }
    startTransition(async () => {
      const res = await claimTask({ taskId: card.id });
      if (!res.ok) {
        onResult({ kind: "fail", message: res.error });
        return;
      }
      onResult({
        kind: "win",
        message: `+${res.minutesEarned} min — nice work!`,
      });
      router.refresh();
    });
  }

  const rewardText =
    card.reward_type === "fixed"
      ? `Earn ${card.reward_amount} min`
      : `${card.reward_amount}× per minute${
          card.max_daily_minutes ? ` (cap ${card.max_daily_minutes}/day)` : ""
        }`;

  return (
    <Card
      className={`overflow-hidden transition-opacity ${locked ? "opacity-60" : ""}`}
    >
      <CardContent className="p-4 flex items-center gap-4">
        <div className="text-5xl shrink-0" aria-hidden>
          {card.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-lg leading-tight">
            {card.name}
          </div>
          {card.description ? (
            <div className="text-xs text-muted-foreground line-clamp-1">
              {card.description}
            </div>
          ) : null}
          <div className="text-sm font-display font-semibold text-positive mt-0.5">
            {rewardText}
          </div>
          {card.locked_reason ? (
            <div className="text-xs text-muted-foreground italic mt-1">
              {card.locked_reason}
            </div>
          ) : null}
          {!card.locked_reason &&
          card.reward_type === "per_minute" &&
          card.earned_today > 0 ? (
            <div className="text-xs text-muted-foreground mt-1">
              {card.earned_today} earned today
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          size="lg"
          onClick={claim}
          disabled={locked || pending}
          className="shrink-0"
        >
          {locked ? "✓" : pending ? "…" : "Claim"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PerMinuteDialog({
  card,
  onClose,
  onResult,
}: {
  card: KidTaskCard;
  onClose: () => void;
  onResult: (t: Toast) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [minutes, setMinutes] = useState(15);

  const projected = Math.floor(minutes * card.reward_amount);
  const capped =
    card.remaining_cap != null && projected > card.remaining_cap
      ? card.remaining_cap
      : projected;

  function bump(delta: number) {
    setMinutes((m) => Math.max(1, Math.min(24 * 60, m + delta)));
  }

  function submit() {
    startTransition(async () => {
      const res = await claimTask({
        taskId: card.id,
        durationMinutes: minutes,
      });
      if (!res.ok) {
        onResult({ kind: "fail", message: res.error });
        return;
      }
      onResult({
        kind: "win",
        message: res.clamped
          ? `Capped at ${res.minutesEarned} min — nice job!`
          : `+${res.minutesEarned} min — nice job!`,
      });
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4 animate-bounce-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="w-full max-w-md">
        <CardContent className="p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl" aria-hidden>
              {card.icon}
            </span>
            <div>
              <h2 className="font-display font-extrabold text-xl">{card.name}</h2>
              <p className="text-sm text-muted-foreground">
                How many minutes did you spend?
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 justify-center">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => bump(-5)}
              aria-label="minus 5"
            >
              −5
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => bump(-1)}
              aria-label="minus 1"
            >
              −1
            </Button>
            <div className="font-display font-extrabold text-5xl tabular-nums w-24 text-center">
              {minutes}
            </div>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => bump(1)}
              aria-label="plus 1"
            >
              +1
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => bump(5)}
              aria-label="plus 5"
            >
              +5
            </Button>
          </div>

          <div className="text-center text-sm">
            You&apos;ll earn{" "}
            <span className="font-display font-extrabold text-positive">
              {capped} min
            </span>{" "}
            of screen time
            {capped !== projected ? (
              <span className="text-muted-foreground">
                {" "}
                (capped at today&apos;s limit)
              </span>
            ) : null}
            .
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="lg"
              className="flex-1"
              onClick={submit}
              disabled={pending}
            >
              {pending ? "Claiming…" : "Claim"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ToastBanner({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const isWin = toast.kind === "win";
  return (
    <button
      type="button"
      onClick={onDismiss}
      className={`text-left rounded-lg px-4 py-3 border-2 shadow-pop-sm flex items-center gap-3 animate-bounce-in ${
        isWin
          ? "bg-positive/15 border-positive/40 text-foreground"
          : "bg-negative/10 border-negative/40 text-foreground"
      }`}
    >
      <span className="text-3xl" aria-hidden>
        {isWin ? "🎉" : "🤔"}
      </span>
      <span className="font-display font-bold flex-1">{toast.message}</span>
      <span className="text-xs text-muted-foreground" aria-hidden>
        tap to close
      </span>
    </button>
  );
}
