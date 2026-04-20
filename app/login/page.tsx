import Link from "next/link";
import { LoginChooser } from "./login-chooser";

export const metadata = {
  title: "Sign in — ChorePop",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-5 py-4 border-b border-border/60">
        <Link
          href="/"
          className="flex items-center gap-2 font-display font-bold text-xl w-fit"
        >
          <span className="text-2xl" aria-hidden>🍿</span>
          <span>ChorePop</span>
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <LoginChooser searchParamsPromise={searchParams} />
        </div>
      </div>
    </main>
  );
}
