"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ParentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/parent] render error:", error);
  }, [error]);

  return (
    <div className="rounded-lg border border-negative/40 bg-negative/10 p-6 max-w-2xl">
      <h2 className="font-display font-bold text-xl mb-2">Something broke</h2>
      <pre className="text-xs whitespace-pre-wrap font-mono bg-card/50 p-3 rounded border border-border/40 mb-4 overflow-auto">
        {error.message}
        {error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </pre>
      <Button onClick={reset} size="sm">
        Try again
      </Button>
    </div>
  );
}
