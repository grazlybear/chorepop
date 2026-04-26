"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  adoptSuggestedTask,
  createTask,
  deleteTask,
  setTaskActive,
  updateTask,
  type TaskInput,
} from "./actions";

export type RewardType = "fixed" | "per_minute";
export type Recurrence = "daily" | "weekly" | "anytime";

export type TaskRow = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  reward_type: RewardType;
  reward_amount: number;
  recurrence: Recurrence;
  is_shared: boolean;
  max_daily_minutes: number | null;
  is_active: boolean;
  assigned_kid_ids: string[];
};

export type SuggestedTask = {
  id: string;
  name: string;
  icon: string;
  reward_type: RewardType;
  reward_amount: number;
  recurrence: Recurrence;
  is_shared: boolean;
};

export type KidLite = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

const ICON_CHOICES = [
  "✅", "🛏️", "🍽️", "📚", "🌳", "🏃", "🧹", "🗑️",
  "✏️", "🐶", "🌱", "🪥", "🚿", "🧦", "🥗", "🎵",
  "🏊", "🚲", "🧺", "🪣", "🧼", "🛁", "🚪", "📖",
];

function formatReward(t: { reward_type: RewardType; reward_amount: number }) {
  if (t.reward_type === "fixed") {
    return `Earn ${t.reward_amount} min`;
  }
  return `${t.reward_amount}× per minute`;
}

function recurrenceLabel(r: Recurrence) {
  return r === "daily" ? "Daily" : r === "weekly" ? "Weekly" : "Anytime";
}

export function TasksManager({
  tasks,
  kids,
  suggested,
}: {
  tasks: TaskRow[];
  kids: KidLite[];
  suggested: SuggestedTask[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const editingTask = useMemo(
    () => (editingId ? tasks.find((t) => t.id === editingId) ?? null : null),
    [editingId, tasks],
  );

  function startCreate() {
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(taskId: string) {
    setEditingId(taskId);
    setShowForm(true);
  }

  function closeForm() {
    setEditingId(null);
    setShowForm(false);
  }

  return (
    <div className="flex flex-col gap-6">
      {showForm ? (
        <TaskForm
          key={editingTask?.id ?? "new"}
          kids={kids}
          existing={editingTask}
          onClose={closeForm}
        />
      ) : (
        <Button size="lg" onClick={startCreate} className="self-start">
          + New task
        </Button>
      )}

      {tasks.length === 0 && suggested.length > 0 ? (
        <SuggestedPicker suggested={suggested} hasKids={kids.length > 0} />
      ) : null}

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No tasks yet. Add a starter or build your own.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              kids={kids}
              onEdit={() => startEdit(task.id)}
            />
          ))}
        </div>
      )}

      {tasks.length > 0 && suggested.length > 0 ? (
        <SuggestedPicker
          suggested={suggested}
          hasKids={kids.length > 0}
          compact
        />
      ) : null}
    </div>
  );
}

function SuggestedPicker({
  suggested,
  hasKids,
  compact,
}: {
  suggested: SuggestedTask[];
  hasKids: boolean;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display font-bold text-xl">
            {compact ? "More starters" : "Quick add starter tasks"}
          </h2>
          <p className="text-sm text-muted-foreground">
            One click to add. Auto-assigns to{" "}
            {hasKids ? "all your kids" : "any kids you add later"}.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {suggested.map((s) => (
            <SuggestedRow key={s.id} suggested={s} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SuggestedRow({ suggested }: { suggested: SuggestedTask }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function adopt() {
    setError(null);
    startTransition(async () => {
      const res = await adoptSuggestedTask(suggested.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-md border border-border/60 bg-muted/30">
      <span className="text-2xl shrink-0" aria-hidden>
        {suggested.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold leading-tight truncate">
          {suggested.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatReward(suggested)} · {recurrenceLabel(suggested.recurrence)}
          {!suggested.is_shared ? " · One kid" : ""}
        </div>
        {error ? <div className="text-xs text-negative mt-1">{error}</div> : null}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={adopt}
        disabled={pending}
      >
        {pending ? "…" : "+ Add"}
      </Button>
    </div>
  );
}

function TaskCard({
  task,
  kids,
  onEdit,
}: {
  task: TaskRow;
  kids: KidLite[];
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const assignedKids = kids.filter((k) => task.assigned_kid_ids.includes(k.id));

  function toggleActive() {
    setError(null);
    startTransition(async () => {
      const res = await setTaskActive(task.id, !task.is_active);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  function remove() {
    if (
      !window.confirm(
        `Delete "${task.name}"? Existing completions will also be removed.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteTask(task.id);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <Card className={task.is_active ? "" : "opacity-60"}>
      <CardContent className="p-4 sm:p-5 flex items-start gap-4">
        <div className="text-3xl shrink-0" aria-hidden>
          {task.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-display font-bold text-lg leading-tight truncate">
              {task.name}
              {!task.is_active ? (
                <span className="text-xs text-muted-foreground font-medium ml-2">
                  (inactive)
                </span>
              ) : null}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {formatReward(task)} · {recurrenceLabel(task.recurrence)}
            {!task.is_shared ? " · One kid only" : ""}
            {task.reward_type === "per_minute" && task.max_daily_minutes
              ? ` · cap ${task.max_daily_minutes} min/day`
              : ""}
          </div>
          {assignedKids.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {assignedKids.map((k) => (
                <span
                  key={k.id}
                  className="inline-flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-0.5"
                >
                  <span aria-hidden>{k.avatar_url ?? "🙂"}</span>
                  <span>{k.display_name}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground mt-2 italic">
              No kids assigned — kids won&apos;t see this task.
            </div>
          )}
          {error ? <div className="text-xs text-negative mt-2">{error}</div> : null}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            disabled={pending}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleActive}
            disabled={pending}
          >
            {task.is_active ? "Pause" : "Resume"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={remove}
            disabled={pending}
            className="text-negative hover:bg-negative/10"
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskForm({
  kids,
  existing,
  onClose,
}: {
  kids: KidLite[];
  existing: TaskRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? ICON_CHOICES[0]);
  const [rewardType, setRewardType] = useState<RewardType>(
    existing?.reward_type ?? "fixed",
  );
  const [rewardAmount, setRewardAmount] = useState<string>(
    existing ? String(existing.reward_amount) : "5",
  );
  const [recurrence, setRecurrence] = useState<Recurrence>(
    existing?.recurrence ?? "daily",
  );
  const [isShared, setIsShared] = useState<boolean>(existing?.is_shared ?? true);
  const [maxDailyMinutes, setMaxDailyMinutes] = useState<string>(
    existing?.max_daily_minutes != null ? String(existing.max_daily_minutes) : "",
  );
  const [assignedKids, setAssignedKids] = useState<Set<string>>(
    () => new Set(existing?.assigned_kid_ids ?? kids.map((k) => k.id)),
  );
  const [error, setError] = useState<string | null>(null);

  function toggleKid(id: string) {
    const next = new Set(assignedKids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAssignedKids(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedReward = Number(rewardAmount);
    if (!name.trim()) return setError("Name is required");
    if (Number.isNaN(parsedReward) || parsedReward < 0) {
      return setError("Reward must be a non-negative number");
    }

    let parsedCap: number | null = null;
    if (rewardType === "per_minute" && maxDailyMinutes.trim()) {
      const n = Number(maxDailyMinutes);
      if (Number.isNaN(n) || n < 0) {
        return setError("Daily cap must be a non-negative number");
      }
      parsedCap = Math.floor(n);
    }

    const input: TaskInput = {
      name: name.trim(),
      description: description.trim() || null,
      icon,
      rewardType,
      rewardAmount: parsedReward,
      recurrence,
      isShared,
      maxDailyMinutes: parsedCap,
      assignedKidIds: Array.from(assignedKids),
    };

    startTransition(async () => {
      const res = existing
        ? await updateTask(existing.id, input)
        : await createTask(input);
      if (!res.ok) return setError(res.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-xl">
              {existing ? "Edit task" : "New task"}
            </h2>
            <button
              type="button"
              onClick={onClose}
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Make Your Bed"
              maxLength={80}
              required
              className="h-12 px-4 rounded-lg border-2 border-border bg-background focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-display font-semibold text-sm">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Pillows fluffed, sheets straightened"
              maxLength={200}
              className="h-12 px-4 rounded-lg border-2 border-border bg-background focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="font-display font-semibold text-sm">Icon</span>
            <div className="grid grid-cols-8 gap-2">
              {ICON_CHOICES.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  aria-pressed={icon === emoji}
                  className={`text-2xl h-11 rounded-md border-2 transition-all active:scale-95 ${
                    icon === emoji
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <span aria-hidden>{emoji}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-display font-semibold text-sm">Reward type</span>
            <div className="grid grid-cols-2 gap-2">
              <RewardTypeOption
                value="fixed"
                current={rewardType}
                title="Fixed"
                subtitle="Set minutes per completion"
                onChange={setRewardType}
              />
              <RewardTypeOption
                value="per_minute"
                current={rewardType}
                title="Per minute"
                subtitle="Earn per minute of activity"
                onChange={setRewardType}
              />
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-display font-semibold text-sm">
              {rewardType === "fixed"
                ? "Minutes earned per completion"
                : "Minutes earned per minute spent"}
            </span>
            <input
              type="number"
              step={rewardType === "per_minute" ? "0.1" : "1"}
              min="0"
              value={rewardAmount}
              onChange={(e) => setRewardAmount(e.target.value)}
              required
              className="h-12 px-4 rounded-lg border-2 border-border bg-background focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary"
            />
            <span className="text-xs text-muted-foreground">
              {rewardType === "per_minute"
                ? "Decimals OK. e.g. 0.5 = 30 min activity → 15 min screen time."
                : "Whole minutes recommended."}
            </span>
          </label>

          {rewardType === "per_minute" ? (
            <label className="flex flex-col gap-1.5">
              <span className="font-display font-semibold text-sm">
                Daily cap{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <input
                type="number"
                step="1"
                min="0"
                value={maxDailyMinutes}
                onChange={(e) => setMaxDailyMinutes(e.target.value)}
                placeholder="No cap"
                className="h-12 px-4 rounded-lg border-2 border-border bg-background focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary"
              />
              <span className="text-xs text-muted-foreground">
                Max minutes a single kid can earn from this task per day.
              </span>
            </label>
          ) : null}

          <div className="flex flex-col gap-2">
            <span className="font-display font-semibold text-sm">Recurrence</span>
            <div className="grid grid-cols-3 gap-2">
              {(["daily", "weekly", "anytime"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRecurrence(r)}
                  aria-pressed={recurrence === r}
                  className={`h-11 rounded-md border-2 font-display font-bold capitalize transition-all active:scale-95 ${
                    recurrence === r
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-md border border-border/60 bg-muted/30 cursor-pointer">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-2 border-border accent-primary"
            />
            <span>
              <span className="font-display font-semibold text-sm">Shared task</span>
              <span className="block text-xs text-muted-foreground">
                When on, multiple kids can each claim this (e.g. &ldquo;Make your bed&rdquo;).
                Off means only one kid can claim per period.
              </span>
            </span>
          </label>

          <div className="flex flex-col gap-2">
            <span className="font-display font-semibold text-sm">Assign to</span>
            {kids.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                No kids in this household yet. Add kids first to assign tasks.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {kids.map((kid) => (
                  <label
                    key={kid.id}
                    className="flex items-center gap-3 p-3 rounded-md border border-border/60 bg-muted/30 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={assignedKids.has(kid.id)}
                      onChange={() => toggleKid(kid.id)}
                      className="h-5 w-5 rounded border-2 border-border accent-primary"
                    />
                    <span className="text-2xl" aria-hidden>
                      {kid.avatar_url ?? "🙂"}
                    </span>
                    <span className="font-display font-semibold">
                      {kid.display_name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Saving…" : existing ? "Save changes" : "Create task"}
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
        </form>
      </CardContent>
    </Card>
  );
}

function RewardTypeOption({
  value,
  current,
  title,
  subtitle,
  onChange,
}: {
  value: RewardType;
  current: RewardType;
  title: string;
  subtitle: string;
  onChange: (v: RewardType) => void;
}) {
  const selected = value === current;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={selected}
      className={`text-left p-3 rounded-md border-2 transition-all active:scale-95 ${
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-background hover:bg-muted"
      }`}
    >
      <div className="font-display font-bold">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </button>
  );
}
