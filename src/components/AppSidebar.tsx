"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronsUpDown,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  MailCheck,
  MailWarning,
  PenSquare,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Upload,
  UserCog,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/components/SessionProvider";
import { cn } from "@/lib/utils";

type CampaignSummary = {
  id: string;
  name: string;
  status: string;
  recipientCount: number;
  isSending: boolean;
};

type Counts = {
  contacts: number;
  queued: number;
  sent: number;
  templates: number;
  resumes: number;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof Upload;
  badge?: number;
};

const EMPTY: Counts = { contacts: 0, queued: 0, sent: 0, templates: 0, resumes: 0 };
const RECENT_CAMPAIGNS = 5;
const LIVE_REFRESH_MS = 15_000;

function formatCount(value: number) {
  return value > 999 ? `${Math.floor(value / 1000)}k` : String(value);
}

/** A colored dot for a campaign's state; pulses while a send loop is running. */
function StatusDot({ campaign }: { campaign: CampaignSummary }) {
  const color = campaign.isSending
    ? "bg-emerald-500"
    : campaign.status === "PAUSED"
      ? "bg-amber-500"
      : campaign.status === "COMPLETED"
        ? "bg-sky-500"
        : campaign.status === "ACTIVE"
          ? "bg-orange-500"
          : "bg-muted-foreground/40";

  return (
    <span className="relative flex size-2 shrink-0">
      {campaign.isSending ? (
        <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", color)} />
      ) : null}
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  );
}

function statusLabel(campaign: CampaignSummary) {
  if (campaign.isSending) return "Sending";
  if (campaign.status === "ACTIVE") return "Waiting to resume";
  return campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase();
}

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, gmail, signOut } = useSession();
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);

  const load = useCallback(async () => {
    try {
      const [mails, templates, resumes] = await Promise.all([
        fetch("/api/mails?pageSize=1").then((r) => r.json()),
        fetch("/api/templates").then((r) => r.json()),
        fetch("/api/resumes").then((r) => r.json()),
      ]);

      setCampaigns(mails.campaigns ?? []);
      setCounts({
        contacts: mails.contactCount ?? 0,
        queued: mails.queuedCount ?? 0,
        sent: mails.counts?.sent ?? 0,
        templates: templates.templates?.length ?? 0,
        resumes: resumes.resumes?.length ?? 0,
      });
    } catch {
      // The sidebar is navigation first; badge counts are a nicety, so a failed
      // fetch should never blank out the nav.
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load, pathname]);

  // Keep the status dots honest while something is sending.
  const anySending = campaigns.some((campaign) => campaign.isSending);

  useEffect(() => {
    if (!anySending) {
      return;
    }

    const interval = window.setInterval(() => void load(), LIVE_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [anySending, load]);

  /**
   * Matches path and the status filter, so Mail dashboard, Queued and Sent (the same
   * page with different ?status=) are never all highlighted at once.
   */
  function isActive(href: string) {
    const [base, query = ""] = href.split("?");
    const wanted = new URLSearchParams(query).get("status");
    return pathname === base.split("#")[0] && (searchParams.get("status") ?? null) === wanted;
  }

  const workflow: NavItem[] = [
    { href: "/", label: "Import contacts", icon: Upload, badge: counts.contacts },
    { href: "/compose", label: "Compose", icon: PenSquare },
  ];

  const library: NavItem[] = [
    { href: "/templates", label: "Templates", icon: FileText, badge: counts.templates },
    { href: "/templates#resumes", label: "Resumes", icon: Inbox, badge: counts.resumes },
  ];

  const tracking: NavItem[] = [
    { href: "/dashboard", label: "All mail", icon: LayoutDashboard },
    { href: "/dashboard?status=PENDING", label: "Queued", icon: Mail, badge: counts.queued },
    { href: "/dashboard?status=SENT", label: "Sent", icon: Send, badge: counts.sent },
  ];

  const account: NavItem[] = [
    { href: "/settings", label: "Settings", icon: Settings },
    ...(user?.role === "ADMIN" ? [{ href: "/admin/users", label: "Users & roles", icon: UserCog }] : []),
  ];

  function renderItems(items: NavItem[]) {
    return items.map((item) => (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton isActive={isActive(item.href)} tooltip={item.label} render={<Link href={item.href} />}>
          <item.icon />
          <span>{item.label}</span>
        </SidebarMenuButton>
        {item.badge ? <SidebarMenuBadge>{formatCount(item.badge)}</SidebarMenuBadge> : null}
      </SidebarMenuItem>
    ));
  }

  const recent = campaigns.slice(0, RECENT_CAMPAIGNS);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="HireNow" render={<Link href="/" />}>
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Send className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="font-heading truncate font-semibold">HireNow</span>
                <span className="text-muted-foreground truncate text-xs">Hiring outreach</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workflow</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(workflow)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Campaigns</SidebarGroupLabel>
          <SidebarGroupAction title="New campaign" render={<Link href="/compose" />}>
            <Plus />
            <span className="sr-only">New campaign</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {recent.length === 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="No campaigns yet" render={<Link href="/compose" />}>
                    <Plus />
                    <span className="text-muted-foreground">Create your first campaign</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : (
                recent.map((campaign) => (
                  <SidebarMenuItem key={campaign.id}>
                    <SidebarMenuButton
                      isActive={pathname === `/dashboard/${campaign.id}`}
                      tooltip={`${campaign.name} · ${statusLabel(campaign)}`}
                      render={<Link href={`/dashboard/${campaign.id}`} />}
                    >
                      <span className="flex size-4 items-center justify-center">
                        <StatusDot campaign={campaign} />
                      </span>
                      <span className="truncate">{campaign.name}</span>
                      <span className="sr-only">, {statusLabel(campaign)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tracking</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(tracking)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Library</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(library)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(account)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {gmail?.connected ? (
              <SidebarMenuButton tooltip={`Sending as ${gmail.address}`} render={<Link href="/settings" />}>
                <MailCheck className="text-emerald-600" />
                <span className="truncate text-xs">{gmail.address}</span>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton
                tooltip="Connect Gmail to send"
                className="text-amber-700 hover:text-amber-800"
                render={<Link href="/settings?setup=1" />}
              >
                <MailWarning />
                <span className="text-xs font-medium">Connect Gmail to send</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>

          {user ? (
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton size="lg" tooltip={`${user.name} (${user.role.toLowerCase()})`}>
                      <div className="bg-sidebar-accent text-sidebar-accent-foreground flex aspect-square size-8 items-center justify-center rounded-lg text-sm font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="grid flex-1 text-left leading-tight">
                        <span className="truncate font-medium">{user.name}</span>
                        <span className="text-muted-foreground truncate text-xs">{user.email}</span>
                      </div>
                      <ChevronsUpDown className="ml-auto size-4" />
                    </SidebarMenuButton>
                  }
                />
                <DropdownMenuContent side="top" align="start" className="w-60">
                  {/* Base UI requires a label to sit inside a group. */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      <div className="grid gap-1">
                        <span className="truncate text-sm font-medium">{user.name}</span>
                        <span className="text-muted-foreground truncate text-xs">{user.email}</span>
                        <Badge variant={user.role === "ADMIN" ? "default" : "secondary"} className="w-fit gap-1">
                          {user.role === "ADMIN" ? <ShieldCheck className="size-3" /> : <Users className="size-3" />}
                          {user.role === "ADMIN" ? "Administrator" : "User"}
                        </Badge>
                      </div>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/settings")}>
                    <Settings className="size-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void signOut()}>
                    <LogOut className="size-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          ) : null}

          {user ? (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Log out" onClick={() => void signOut()}>
                <LogOut />
                <span>Log out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
