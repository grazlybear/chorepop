import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ParentDashboardPage() {
  return (
    <div>
      <h1 className="font-display font-extrabold text-3xl sm:text-4xl mb-6">
        Welcome back 👋
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Your household is set up</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          <p>
            The full parent dashboard — kid cards, balances, streaks, and today&apos;s
            completions — is coming in the next milestone.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
