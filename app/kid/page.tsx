import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function KidDashboardPage() {
  return (
    <div>
      <h1 className="font-display font-extrabold text-3xl sm:text-4xl mb-6">
        Hey! 👋
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>You&apos;re signed in 🎉</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          <p>
            The real kid dashboard — balance, level, streaks, and today&apos;s chores
            — is coming next.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
