"use client";

import { use, useState } from "react";
import { ParentLogin } from "./parent-login";
import { KidLogin } from "./kid-login";
import { Button } from "@/components/ui/button";

type Mode = "choose" | "parent" | "kid";

export function LoginChooser({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ next?: string; error?: string }>;
}) {
  const params = use(searchParamsPromise);
  const [mode, setMode] = useState<Mode>("choose");

  if (mode === "parent") {
    return <ParentLogin onBack={() => setMode("choose")} nextPath={params.next} />;
  }
  if (mode === "kid") {
    return <KidLogin onBack={() => setMode("choose")} />;
  }

  return (
    <div className="bg-card rounded-lg shadow-pop-sm border border-border/50 p-7 sm:p-8">
      <h1 className="font-display font-extrabold text-3xl sm:text-4xl mb-2">
        Who&apos;s signing in?
      </h1>
      <p className="text-muted-foreground mb-7">Pick the one that sounds like you.</p>

      {params.error ? (
        <div
          role="alert"
          className="mb-5 rounded-md bg-negative/10 text-negative-foreground text-sm p-3 border border-negative/30"
        >
          <strong className="font-semibold">Hmm. </strong>
          {decodeURIComponent(params.error)}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button size="xl" onClick={() => setMode("parent")}>
          <span className="mr-1 text-xl" aria-hidden>👩‍💻</span> I&apos;m a Parent
        </Button>
        <Button size="xl" variant="secondary" onClick={() => setMode("kid")}>
          <span className="mr-1 text-xl" aria-hidden>🧒</span> I&apos;m a Kid
        </Button>
      </div>
    </div>
  );
}
