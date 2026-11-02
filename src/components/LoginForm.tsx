"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { safeNextPath } from "@/lib/safeNext";

// Sign-in only. Accounts are created by an administrator (Users & roles), and the
// first administrator from the command line: pnpm create-admin.
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  const [isChecking, setIsChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const checkSession = useCallback(async () => {
    try {
      const payload = await fetch("/api/auth/me").then((r) => r.json());

      if (payload.user) {
        router.replace(next);
        return;
      }
    } catch {
      // Fall through to the form; signing in will surface any real problem.
    }

    setIsChecking(false);
  }, [next, router]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void checkSession(), 0);
    return () => window.clearTimeout(timeout);
  }, [checkSession]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIsBusy(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to sign in.");
      }

      router.replace(next);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="bg-primary text-primary-foreground mb-2 flex size-9 items-center justify-center rounded-lg">
            <ShieldCheck className="size-5" />
          </div>
          <CardTitle>Sign in to HireNow</CardTitle>
          <CardDescription>Enter your email and password to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          {isChecking ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Checking...
            </p>
          ) : (
            <form className="grid gap-4" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error ? (
                <p className="text-destructive bg-destructive/10 rounded-md p-2 text-sm">{error}</p>
              ) : null}

              <Button type="submit" disabled={isBusy}>
                {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                Sign in
              </Button>

              <p className="text-muted-foreground text-center text-xs">
                No account? Ask your HireNow administrator to create one.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
