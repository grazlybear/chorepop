"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { adjustBalance, createKid, resetKidPin } from "./actions";

export type KidRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  balance: number;
};

const AVATAR_CHOICES = [
  "🦊", "🐼", "🐯", "🐸", "🦁", "🐶", "🐱", "🐰",
  "🐨", "🐵", "🦄", "🐲", "🐧", "🐢", "🐙", "🦋",
];

export function KidsManager({ kids }: { kids: KidRow[] }) {
  return (
    <div className="flex flex-col gap-6">
      <AddKidForm />
      {kids.length > 0 ? (
        <div className="grid gap-4">
          {kids.map((kid) => (
            <KidRowCard key={kid.id} kid={kid} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AddKidForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<string>(AVATAR_CHOICES[0]);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDisplayName("");
    setAvatar(AVATAR_CHOICES[0]);
    setPin("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!displayName.trim()) return setError("Name is required");
    if (!/^\d{4}$/.test(pin)) return setError("PIN must be 4 digits");

    startTransition(async () => {
      const res = await createKid({
        displayName: displayName.trim(),
        avatarUrl: avatar,
        pin,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="lg" onClick={() => setOpen(true)} className="self-start">
        + Add a kid
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-xl">Add a kid</h2>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="text-sm text-muted-foreground hover:text-foreground font-semibold"
            >
              Cancel
            </button>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-md bg-negative/10 text-negative-foreground text-sm p-3 border border-negative/30"
            >
              {error}
            </div>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="font-display font-semibold text-sm">Name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Lila"
              maxLength={40}
              required
              className="h-12 px-4 rounded-lg border-2 border-border bg-background focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="font-display font-semibold text-sm">Avatar</span>
            <div className="grid grid-cols-8 gap-2">
              {AVATAR_CHOICES.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(emoji)}
                  aria-pressed={avatar === emoji}
                  className={`text-3xl h-12 rounded-md border-2 transition-all active:scale-95 ${
                    avatar === emoji
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <span aria-hidden>{emoji}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-display font-semibold text-sm">4-digit PIN</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              required
              className="h-12 px-4 rounded-lg border-2 border-border bg-background tracking-[0.5em] text-center font-display font-bold text-2xl focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary"
            />
          </label>

          <Button type="submit" size="lg" disabled={pending} className="self-start">
            {pending ? "Adding…" : "Add kid"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function KidRowCard({ kid }: { kid: KidRow }) {
  const balanceTone =
    kid.balance < 0
      ? "text-negative"
      : kid.balance < 30
        ? "text-accent-foreground"
        : "text-positive";

  return (
    <Card>
      <CardContent className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="text-5xl shrink-0" aria-hidden>
            {kid.avatar_url ?? "🙂"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-lg leading-tight truncate">
              {kid.display_name}
            </div>
            <div className={`font-display font-extrabold text-xl ${balanceTone}`}>
              {kid.balance >= 0 ? "+" : ""}
              {kid.balance} min this week
            </div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <AdjustBalanceForm kidId={kid.id} kidName={kid.display_name} />
          <ResetPinForm kidId={kid.id} kidName={kid.display_name} />
        </div>
      </CardContent>
    </Card>
  );
}

function AdjustBalanceForm({ kidId, kidName }: { kidId: string; kidName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [minutes, setMinutes] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMessage(null);
    const parsed = parseInt(minutes, 10);
    if (Number.isNaN(parsed) || parsed === 0) {
      return setError("Enter a non-zero number");
    }
    startTransition(async () => {
      const res = await adjustBalance({
        kidId,
        minutes: parsed,
        reason: reason.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOkMessage(`${parsed > 0 ? "+" : ""}${parsed} min applied to ${kidName}`);
      setMinutes("");
      setReason("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-md border border-border/60 bg-muted/40 p-3 flex flex-col gap-2"
    >
      <span className="font-display font-semibold text-sm">Adjust balance</span>
      {error ? (
        <span className="text-xs text-negative">{error}</span>
      ) : okMessage ? (
        <span className="text-xs text-positive">{okMessage}</span>
      ) : (
        <span className="text-xs text-muted-foreground">
          Use negative to deduct (e.g. −15)
        </span>
      )}
      <div className="flex gap-2">
        <input
          type="number"
          step="1"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="±min"
          aria-label={`Minutes for ${kidName}`}
          className="h-10 w-24 px-3 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          maxLength={80}
          aria-label={`Reason for ${kidName}`}
          className="h-10 flex-1 min-w-0 px-3 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "…" : "Apply"}
        </Button>
      </div>
    </form>
  );
}

function ResetPinForm({ kidId, kidName }: { kidId: string; kidName: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMessage(null);
    if (!/^\d{4}$/.test(pin)) return setError("PIN must be 4 digits");

    startTransition(async () => {
      const res = await resetKidPin({ kidId, pin });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOkMessage(`PIN updated for ${kidName}`);
      setPin("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/40 p-3 flex flex-col gap-2">
        <span className="font-display font-semibold text-sm">PIN</span>
        {okMessage ? (
          <span className="text-xs text-positive">{okMessage}</span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Reset the 4-digit login PIN for {kidName}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(true);
            setOkMessage(null);
          }}
          className="self-start"
        >
          Reset PIN
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-md border border-border/60 bg-muted/40 p-3 flex flex-col gap-2"
    >
      <span className="font-display font-semibold text-sm">Reset PIN</span>
      {error ? <span className="text-xs text-negative">{error}</span> : null}
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{4}"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="••••"
          aria-label={`New PIN for ${kidName}`}
          className="h-10 w-28 px-3 rounded-md border border-border bg-background tracking-[0.4em] text-center font-display font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          autoFocus
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
            setPin("");
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
