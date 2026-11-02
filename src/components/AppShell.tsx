"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { LogOut, MailCheck, MailWarning, Plus } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SessionProvider, useSession } from "@/components/SessionProvider";
import { Sidebar, SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TITLES: Record<string, string> = {
  "/": "Import contacts",
  "/compose": "Compose campaign",
  "/templates": "Templates & resumes",
  "/dashboard": "Mail dashboard",
  "/settings": "Settings",
  "/admin/users": "Users & roles",
};

/** Header pill: which Gmail account mail goes out from, or a prompt to connect one. */
function GmailPill() {
  const { gmail } = useSession();

  if (!gmail) {
    return null;
  }

  return gmail.connected ? (
    <Link
      href="/settings"
      className="hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted sm:inline-flex"
      title="The Gmail account your campaigns send from"
    >
      <MailCheck className="size-3.5 text-emerald-600" />
      <span className="max-w-48 truncate">{gmail.address}</span>
    </Link>
  ) : (
    <Link
      href="/settings?setup=1"
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
    >
      <MailWarning className="size-3.5" />
      Connect Gmail
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const title = TITLES[pathname] ?? (pathname.startsWith("/dashboard/") ? "Campaign" : "HireNow");

  return (
    <SidebarProvider>
      {/* The sidebar reads ?status= to highlight the right link, which needs a Suspense boundary. */}
      <Suspense fallback={<Sidebar collapsible="icon" />}>
        <AppSidebar />
      </Suspense>
      <SidebarInset>
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h1 className="truncate text-sm font-medium">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <GmailPill />
            {pathname !== "/compose" ? (
              <Link href="/compose" className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}>
                <Plus />
                New campaign
              </Link>
            ) : null}
            {user ? (
              <Button variant="outline" size="sm" onClick={() => void signOut()} title={`Log out ${user.email}`}>
                <LogOut />
                <span className="hidden sm:inline">Log out</span>
              </Button>
            ) : null}
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <SessionProvider>
      {/* Signed-out screens have no navigation to offer, so they render bare. */}
      {pathname === "/login" ? children : <Shell>{children}</Shell>}
    </SessionProvider>
  );
}
