"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  changeMemberRole,
  regenerateInviteCode,
  removeMember,
  setHouseholdPaused,
  setHouseholdTimezone,
} from "./actions";

type Member = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: "owner" | "parent";
};

type Household = {
  name: string;
  inviteCode: string;
  isPaused: boolean;
  timezone: string;
};

const COMMON_TIMEZONES: Array<{ value: string; label: string }> = [
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix, no DST)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "UTC", label: "UTC" },
];

export function HouseholdSettings({
  currentUserId,
  currentUserRole,
  household,
  members,
}: {
  currentUserId: string;
  currentUserRole: "owner" | "parent";
  household: Household;
  members: Member[];
}) {
  const isOwner = currentUserRole === "owner";
  return (
    <div className="flex flex-col gap-6">
      <InviteCodeCard
        code={household.inviteCode}
        canRegenerate={isOwner}
      />
      <VacationCard isPaused={household.isPaused} canToggle={isOwner} />
      <TimezoneCard timezone={household.timezone} canEdit={isOwner} />
      <MembersCard
        members={members}
        currentUserId={currentUserId}
        canManage={isOwner}
      />
    </div>
  );
}

function InviteCodeCard({
  code,
  canRegenerate,
}: {
  code: string;
  canRegenerate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy — select and copy manually");
    }
  }

  function regenerate() {
    if (
      !window.confirm(
        "Generate a new invite code? Old code will stop working immediately.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await regenerateInviteCode();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="p-5 sm:p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display font-bold text-xl">Invite code</h2>
          <p className="text-sm text-muted-foreground">
            Share this with kids on their first sign-in.
          </p>
        </div>

        <div className="rounded-lg bg-muted/50 border-2 border-dashed border-border px-4 py-6 text-center">
          <div className="font-display font-extrabold text-4xl sm:text-5xl tracking-[0.3em]">
            {code}
          </div>
        </div>

        {error ? (
          <div className="text-sm text-negative">{error}</div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={copy}>
            {copied ? "Copied!" : "Copy code"}
          </Button>
          {canRegenerate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={regenerate}
              disabled={pending}
            >
              {pending ? "Generating…" : "Generate new code"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function VacationCard({
  isPaused,
  canToggle,
}: {
  isPaused: boolean;
  canToggle: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = await setHouseholdPaused(!isPaused);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="p-5 sm:p-6 flex items-start gap-4">
        <div className="text-4xl shrink-0" aria-hidden>
          {isPaused ? "🌴" : "🏃"}
        </div>
        <div className="flex-1">
          <h2 className="font-display font-bold text-xl">Vacation mode</h2>
          <p className="text-sm text-muted-foreground">
            {isPaused
              ? "Penalties are paused. Kids keep earning, no carryover penalty applies."
              : "Penalties accrue weekly. Turn this on for vacations or breaks."}
          </p>
          {error ? <div className="text-sm text-negative mt-2">{error}</div> : null}
        </div>
        {canToggle ? (
          <Button
            type="button"
            variant={isPaused ? "default" : "outline"}
            size="sm"
            onClick={toggle}
            disabled={pending}
          >
            {pending ? "…" : isPaused ? "Resume" : "Pause"}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground self-center">
            Owner only
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function TimezoneCard({
  timezone,
  canEdit,
}: {
  timezone: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isCommon = COMMON_TIMEZONES.some((t) => t.value === timezone);
  const [mode, setMode] = useState<"common" | "custom">(
    isCommon ? "common" : "custom",
  );
  const [draft, setDraft] = useState(timezone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const localPreview = (() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date());
    } catch {
      return null;
    }
  })();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setHouseholdTimezone(draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="p-5 sm:p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display font-bold text-xl">Timezone</h2>
          <p className="text-sm text-muted-foreground">
            Used for &ldquo;today&rdquo; and weekly rollover. Currently:{" "}
            <span className="font-display font-semibold text-foreground">
              {timezone}
            </span>
            {localPreview ? (
              <>
                {" · "}
                <span className="text-foreground">Local now: {localPreview}</span>
              </>
            ) : null}
          </p>
        </div>

        {canEdit ? (
          <>
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  setMode("common");
                  if (!COMMON_TIMEZONES.some((t) => t.value === draft)) {
                    setDraft(COMMON_TIMEZONES[0].value);
                  }
                }}
                className={`px-3 h-9 rounded-full border-2 font-display font-bold transition-all active:scale-95 ${
                  mode === "common"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                Common
              </button>
              <button
                type="button"
                onClick={() => setMode("custom")}
                className={`px-3 h-9 rounded-full border-2 font-display font-bold transition-all active:scale-95 ${
                  mode === "custom"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                Other (IANA)
              </button>
            </div>

            {mode === "common" ? (
              <select
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-12 px-3 rounded-lg border-2 border-border bg-background focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary"
              >
                {COMMON_TIMEZONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Europe/London"
                className="h-12 px-4 rounded-lg border-2 border-border bg-background focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary font-mono text-sm"
              />
            )}

            {error ? (
              <div className="text-sm text-negative">{error}</div>
            ) : saved ? (
              <div className="text-sm text-positive">Saved.</div>
            ) : null}

            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={save}
              disabled={pending || draft === timezone}
              className="self-start"
            >
              {pending ? "Saving…" : "Save timezone"}
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Owner only</span>
        )}
      </CardContent>
    </Card>
  );
}

function MembersCard({
  members,
  currentUserId,
  canManage,
}: {
  members: Member[];
  currentUserId: string;
  canManage: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display font-bold text-xl">Parents & owners</h2>
          <p className="text-sm text-muted-foreground">
            Other adults on this household. Kids are managed on the Kids page.
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-border/60">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isSelf={member.id === currentUserId}
              canManage={canManage}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function MemberRow({
  member,
  isSelf,
  canManage,
}: {
  member: Member;
  isSelf: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function makeOwner() {
    if (
      !window.confirm(
        `Transfer ownership to ${member.display_name}? You'll be demoted to parent.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await changeMemberRole({ memberId: member.id, role: "owner" });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  function remove() {
    if (
      !window.confirm(
        `Remove ${member.display_name} from the household? They'll lose access immediately.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await removeMember(member.id);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <li className="py-3 flex items-center gap-3">
      <div className="text-2xl shrink-0" aria-hidden>
        {member.avatar_url ?? (member.role === "owner" ? "👑" : "🧑")}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-semibold truncate">
          {member.display_name}
          {isSelf ? <span className="text-muted-foreground"> · you</span> : null}
        </div>
        <div className="text-xs text-muted-foreground capitalize">
          {member.role}
        </div>
        {error ? <div className="text-xs text-negative mt-1">{error}</div> : null}
      </div>
      {canManage && !isSelf ? (
        <div className="flex gap-1.5 shrink-0">
          {member.role === "parent" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={makeOwner}
              disabled={pending}
            >
              Make owner
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={remove}
            disabled={pending}
            className="text-negative hover:bg-negative/10"
          >
            Remove
          </Button>
        </div>
      ) : null}
    </li>
  );
}
