"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, Trash2, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ManagedUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export function UsersAdmin({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "USER">("USER");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/users");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load users.");
      }

      setUsers(payload.users ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load users.");
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function send(url: string, method: string, body?: unknown) {
    setError("");
    setNotice("");

    const response = await fetch(url, {
      method,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error ?? "Request failed.");
    }

    await load();
    return payload;
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setIsBusy(true);

    try {
      await send("/api/users", "POST", { name, email, password, role });
      setNotice(`Created ${email}.`);
      setName("");
      setEmail("");
      setPassword("");
      setRole("USER");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create the user.");
    } finally {
      setIsBusy(false);
    }
  }

  async function guarded(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Request failed.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-semibold">Users &amp; roles</h1>
        <p className="text-muted-foreground mt-1">
          Administrators manage accounts and roles. Everyone else signs in with the account you create here.
        </p>
      </div>

      {error ? <p className="text-destructive bg-destructive/10 rounded-md p-3 text-sm">{error}</p> : null}
      {notice ? <p className="bg-muted rounded-md p-3 text-sm">{notice}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Add an account</CardTitle>
          <CardDescription>The password is stored only as a bcrypt hash and can never be read back.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" onSubmit={createUser}>
            <div className="grid gap-2">
              <Label htmlFor="new-name">Name</Label>
              <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-email">Email</Label>
              <Input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-password">Password</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min 10 characters"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-role">Role</Label>
              <Select value={role} onValueChange={(value) => setRole(value === "ADMIN" ? "ADMIN" : "USER")}>
                <SelectTrigger id="new-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">User</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={isBusy}>
                {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                Create
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;

                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name}
                      {isSelf ? <span className="text-muted-foreground ml-2 text-xs">(you)</span> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                        {user.role === "ADMIN" ? <ShieldCheck className="size-3" /> : <UserIcon className="size-3" />}
                        {user.role === "ADMIN" ? "Admin" : "User"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "outline" : "destructive"}>
                        {user.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void guarded(() =>
                              send(`/api/users/${user.id}`, "PATCH", {
                                role: user.role === "ADMIN" ? "USER" : "ADMIN",
                              }),
                            )
                          }
                        >
                          Make {user.role === "ADMIN" ? "user" : "admin"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void guarded(() =>
                              send(`/api/users/${user.id}`, "PATCH", { isActive: !user.isActive }),
                            )
                          }
                        >
                          {user.isActive ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isSelf}
                          onClick={() => {
                            if (window.confirm(`Delete ${user.email}? This cannot be undone.`)) {
                              void guarded(() => send(`/api/users/${user.id}`, "DELETE"));
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
