import Link from "next/link";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: "✅",
    title: "Chores that pay",
    body: "Kids earn screen-time minutes for every task they complete. Fixed rewards or per-minute effort — you decide.",
  },
  {
    icon: "🔥",
    title: "Streaks & badges",
    body: "Daily streaks, achievement badges, and a level system keep kids coming back for more.",
  },
  {
    icon: "⏳",
    title: "Weekly rollover",
    body: "Balances carry over week to week. Go negative and the penalty doubles — a gentle nudge toward balance.",
  },
  {
    icon: "👨‍👩‍👧",
    title: "Built for the whole family",
    body: "Parents approve tasks, set the rules, and watch the streaks. Kids log in with a 4-digit PIN.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <nav className="w-full border-b border-border/60 backdrop-blur-sm sticky top-0 bg-background/80 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-5 h-16">
          <Link href="/" className="flex items-center gap-2 font-display font-bold text-xl">
            <span className="text-2xl" aria-hidden>🍿</span>
            <span>ChorePop</span>
          </Link>
          <Button asChild size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto px-5 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-accent/30 text-accent-foreground px-4 py-1.5 text-sm font-semibold mb-6">
          <span aria-hidden>✨</span>
          <span>Chores in. Screen time out.</span>
        </div>
        <h1 className="font-display font-extrabold text-5xl sm:text-6xl md:text-7xl text-balance leading-[1.05] mb-6">
          Turn chores into <span className="text-primary">screen time</span>.
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-balance mb-10">
          ChorePop is a playful family app that rewards kids with screen-time minutes for the tasks
          they finish. Build streaks, unlock badges, level up — and still get the trash out.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="lg">
            <Link href="/login">Get started — it&apos;s free</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="#how">See how it works</Link>
          </Button>
        </div>
      </section>

      <section id="how" className="max-w-5xl mx-auto px-5 py-16">
        <div className="grid sm:grid-cols-2 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-card rounded-lg shadow-pop-sm p-6 border border-border/50"
            >
              <div className="text-4xl mb-3" aria-hidden>{f.icon}</div>
              <h3 className="font-display font-bold text-xl mb-2">{f.title}</h3>
              <p className="text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60 mt-8">
        <div className="max-w-5xl mx-auto px-5 py-8 text-sm text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>&copy; 2026 ChorePop</p>
          <p>Made with coral, teal, and a little 🍿.</p>
        </div>
      </footer>
    </main>
  );
}
