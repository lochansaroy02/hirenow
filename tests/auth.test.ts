import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { safeNextPath } from "@/lib/safeNext";
import { hasTestDatabase, resetDatabase } from "./db";

// Route handlers read the session through next/headers; give them a plain cookie jar.
const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
  }),
}));

const auth = await import("@/lib/auth");

async function signInAs(role: "ADMIN" | "USER") {
  const user = await prisma.user.create({
    data: { email: `${role.toLowerCase()}@x.com`, name: role, passwordHash: "unused", role },
  });
  jar.set(auth.SESSION_COOKIE, auth.signSessionToken({ ...user, tokenVersion: user.tokenVersion }));
  return user;
}

describe("safeNextPath", () => {
  it.each([
    ["/dashboard?status=SENT", "/dashboard?status=SENT"],
    ["https://evil.com", "/"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["javascript:alert(1)", "/"],
    [null, "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe.skipIf(!hasTestDatabase)("sessions and roles", () => {
  beforeEach(async () => {
    await resetDatabase();
    jar.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("accepts a current session", async () => {
    const user = await signInAs("USER");
    expect((await auth.getCurrentUser())?.id).toBe(user.id);
  });

  it("rejects every existing token once sessions are revoked", async () => {
    const user = await signInAs("USER");
    await auth.revokeSessions(user.id);
    expect(await auth.getCurrentUser()).toBeNull();
  });

  it("rejects a deactivated user's token on the next request", async () => {
    const user = await signInAs("USER");
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await expect(auth.requireUser()).rejects.toMatchObject({ status: 401 });
  });

  it("refuses purge to a non-admin and deletes nothing", async () => {
    await signInAs("USER");
    await prisma.contact.create({ data: { name: "n", companyName: "c", hrEmail: "keep@x.com", hrName: "h" } });

    const { POST } = await import("@/app/api/purge/route");
    const response = await POST(
      new Request("http://test/api/purge", {
        method: "POST",
        body: JSON.stringify({ scope: "all", confirm: "DELETE" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await prisma.contact.count()).toBe(1);
  });

  it("lets an admin purge", async () => {
    await signInAs("ADMIN");
    await prisma.contact.create({ data: { name: "n", companyName: "c", hrEmail: "gone@x.com", hrName: "h" } });

    const { POST } = await import("@/app/api/purge/route");
    const response = await POST(
      new Request("http://test/api/purge", {
        method: "POST",
        body: JSON.stringify({ scope: "contacts", confirm: "DELETE" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await prisma.contact.count()).toBe(0);
  });
});
