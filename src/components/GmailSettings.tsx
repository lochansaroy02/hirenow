"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CircleCheck, ExternalLink, Eye, EyeOff, KeyRound, Loader2, MailCheck, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/components/SessionProvider";
import { safeNextPath } from "@/lib/safeNext";

type AccountResponse = {
  gmailAddress: string | null;
  senderName: string;
  connected: boolean;
  needsPassword: boolean;
  verifiedAt: string | null;
};

const STEPS: { title: string; body: React.ReactNode; link?: { href: string; label: string } }[] = [
  {
    title: "Turn on 2-Step Verification",
    body: "Google only offers App Passwords on accounts with 2-Step Verification. If it is already on, skip this step.",
    link: { href: "https://myaccount.google.com/signinoptions/twosv", label: "Open 2-Step Verification" },
  },
  {
    title: "Create an App Password",
    body: (
      <>
        Sign in to the <strong>same Gmail account</strong> you will send from. Type a name such as{" "}
        <em>HireNow</em> and click <strong>Create</strong>.
      </>
    ),
    link: { href: "https://myaccount.google.com/apppasswords", label: "Open App Passwords" },
  },
  {
    title: "Copy the 16-letter password",
    body: (
      <>
        Google shows it once, as four groups of four letters, like <code className="font-mono">abcd efgh ijkl mnop</code>.
        Paste it here with or without the spaces.
      </>
    ),
  },
  {
    title: "Save and send yourself a test",
    body: "HireNow logs in to Gmail before saving, so a wrong password is caught now, not mid-campaign.",
  },
];

export function GmailSettings() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSetup = searchParams.get("setup") === "1";
  const next = safeNextPath(searchParams.get("next"));
  const { refresh: refreshSession } = useSession();

  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [gmailAddress, setGmailAddress] = useState("");
  const [senderName, setSenderName] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "disconnect" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/account/gmail");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load your Gmail account.");
      }

      setAccount(payload);
      setGmailAddress(payload.gmailAddress ?? "");
      setSenderName(payload.senderName ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load your Gmail account.");
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function call(kind: "save" | "test" | "disconnect", request: () => Promise<Response>) {
    setBusy(kind);
    setError("");
    setNotice("");

    try {
      const response = await request();
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Something went wrong.");
      }

      return payload;
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();

    const payload = await call("save", () =>
      fetch("/api/account/gmail", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmailAddress, senderName, appPassword: appPassword || undefined }),
      }),
    );

    if (!payload) {
      return;
    }

    setAppPassword("");
    await Promise.all([load(), refreshSession()]);

    if (isSetup) {
      router.replace(next === "/settings" ? "/" : next);
      return;
    }

    setNotice(payload.verified ? `Connected. Gmail accepted the login for ${payload.gmailAddress}.` : "Saved.");
  }

  async function sendTest() {
    const payload = await call("test", () => fetch("/api/account/gmail/test", { method: "POST" }));

    if (payload) {
      setNotice(`Test email sent to ${payload.sentTo}. Check that inbox.`);
    }
  }

  async function disconnect() {
    const payload = await call("disconnect", () => fetch("/api/account/gmail", { method: "DELETE" }));

    if (payload) {
      setNotice(
        payload.pausedCampaigns
          ? `Disconnected. ${payload.pausedCampaigns} sending campaign(s) were paused.`
          : "Disconnected. Your App Password was deleted from HireNow.",
      );
      await Promise.all([load(), refreshSession()]);
    }
  }

  const connected = Boolean(account?.connected);
  const addressChanged = connected && gmailAddress.trim().toLowerCase() !== (account?.gmailAddress ?? "");
  const passwordRequired = !connected || addressChanged;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {isSetup ? "Connect your Gmail to start sending" : "Settings"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Campaigns are sent from your own Gmail account, so replies come straight to your inbox. HireNow signs in
          with an App Password, a separate password just for this app that you can revoke at any time without
          changing your Google password.
        </p>
      </header>

      {isSetup ? (
        <Alert className="mb-6">
          <KeyRound />
          <AlertTitle>One step before your first campaign</AlertTitle>
          <AlertDescription>
            Follow the steps on the right to create an App Password, then paste it here. It takes about two minutes.
          </AlertDescription>
        </Alert>
      ) : null}

      {account?.needsPassword ? (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlert />
          <AlertTitle>Enter your App Password again</AlertTitle>
          <AlertDescription>
            The saved password can no longer be read, usually because the server&apos;s AUTH_SECRET changed. Paste
            your App Password to reconnect.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlert />
          <AlertTitle>That did not work</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {notice ? (
        <Alert className="mb-6">
          <CircleCheck />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Gmail sending account
                {connected ? (
                  <Badge className="gap-1">
                    <CircleCheck className="size-3" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary">Not connected</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {connected && account?.verifiedAt
                  ? `Gmail last accepted this login on ${new Date(account.verifiedAt).toLocaleString()}.`
                  : "Your campaigns will be sent from this address."}
              </CardDescription>
            </CardHeader>

            <form onSubmit={(event) => void save(event)}>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="gmail-address">Gmail address</Label>
                  <Input
                    id="gmail-address"
                    type="email"
                    autoComplete="email"
                    placeholder="you@gmail.com"
                    value={gmailAddress}
                    onChange={(event) => setGmailAddress(event.target.value)}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="sender-name">Your name, as recruiters see it</Label>
                  <Input
                    id="sender-name"
                    autoComplete="name"
                    placeholder="Priya Sharma"
                    value={senderName}
                    onChange={(event) => setSenderName(event.target.value)}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="app-password">App Password</Label>
                  <div className="relative">
                    <Input
                      id="app-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      className="pr-10 font-mono"
                      placeholder={passwordRequired ? "abcd efgh ijkl mnop" : "Saved. Leave blank to keep it."}
                      value={appPassword}
                      onChange={(event) => setAppPassword(event.target.value)}
                      required={passwordRequired}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Hide App Password" : "Show App Password"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Not your Google password. Stored encrypted, and never shown again after saving.
                  </p>
                </div>
              </CardContent>

              <CardFooter className="mt-2 flex flex-wrap gap-2">
                <Button type="submit" disabled={busy !== null}>
                  {busy === "save" ? <Loader2 className="animate-spin" /> : null}
                  {busy === "save" ? "Checking with Gmail..." : connected ? "Save changes" : "Connect Gmail"}
                </Button>
                {connected ? (
                  <>
                    <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void sendTest()}>
                      {busy === "test" ? <Loader2 className="animate-spin" /> : <MailCheck />}
                      Send test email
                    </Button>
                    <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void disconnect()}>
                      Disconnect
                    </Button>
                  </>
                ) : null}
              </CardFooter>
            </form>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>How to get an App Password</CardTitle>
            <CardDescription>Works for Gmail and Google Workspace addresses.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-5">
              {STEPS.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium">{step.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                    {step.link ? (
                      <a
                        href={step.link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        {step.link.label}
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-6 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No &ldquo;App Passwords&rdquo; option?</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>2-Step Verification is off. Turn it on first (step 1).</li>
                <li>A work or school account&apos;s admin has disabled App Passwords. Ask them, or use a personal Gmail.</li>
                <li>The account uses only security keys (Advanced Protection), which blocks App Passwords.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
