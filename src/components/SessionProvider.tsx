"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type SessionUser = { id: string; email: string; name: string; role: "ADMIN" | "USER" };
export type GmailStatus = { connected: boolean; address: string | null };

type SessionState = {
  user: SessionUser | null;
  gmail: GmailStatus | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState>({
  user: null,
  gmail: null,
  isLoading: true,
  refresh: async () => undefined,
  signOut: async () => undefined,
});

/** Pages a signed-in user may see before connecting Gmail. */
const SETUP_ALLOWED = ["/settings", "/login"];

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // True only when the server answered "no session", never on a failed request.
  const [signedOut, setSignedOut] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const payload = await fetch("/api/auth/me").then((response) => response.json());
      setUser(payload.user ?? null);
      setGmail(payload.gmail ?? null);
      setSignedOut(payload.user === null);
    } catch {
      // Leave the last known state; the proxy still guards every request.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [refresh, pathname]);

  // Signed out underneath us (session revoked, account removed): /api/auth/me has
  // already cleared the stale cookie, so go and sign in again.
  useEffect(() => {
    if (!signedOut || pathname === "/login") {
      return;
    }

    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [pathname, router, signedOut]);

  // Every campaign sends from the user's own Gmail, so nothing else is useful until
  // it is connected. Send them to set it up, remembering where they were going.
  useEffect(() => {
    if (!user || !gmail || gmail.connected || SETUP_ALLOWED.includes(pathname)) {
      return;
    }

    router.replace(`/settings?setup=1&next=${encodeURIComponent(pathname)}`);
  }, [gmail, pathname, router, user]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Leave the signed-in UI even if the request failed; the next request will
      // hit the proxy and land on sign-in either way.
      setUser(null);
      setGmail(null);
      router.replace("/login");
      router.refresh();
    }
  }, [router]);

  return (
    <SessionContext.Provider value={{ user, gmail, isLoading, refresh, signOut }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
