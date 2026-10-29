"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

export interface UserStoreLite {
  id: string;
  name: string;
  platform: string;
  currency: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  stores: UserStoreLite[];
  storeCount: number;
}

export function UsersClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [adding, setAdding] = useState(false);

  // Add user form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit / reset password state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, email: email.trim(), password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to create user");
        setSaving(false);
        return;
      }
      const u = json.data;
      setUsers((prev) => [
        ...prev,
        {
          id: u.id,
          email: u.email,
          name: u.name,
          createdAt: u.createdAt,
          stores: u.stores ?? [],
          storeCount: u._count?.stores ?? 0,
        },
      ]);
      setName("");
      setEmail("");
      setPassword("");
      setAdding(false);
      router.refresh();
    } catch {
      setError("Network error while creating user");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(u: UserRow) {
    setEditingId(u.id);
    setEditName(u.name || "");
    setEditEmail(u.email);
    setEditPassword("");
    setEditError(null);
  }

  async function onUpdate(e: React.FormEvent, id: string) {
    e.preventDefault();
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editName.trim() || null,
          email: editEmail.trim(),
          password: editPassword.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEditError(json.error || "Failed to update user");
        setEditSaving(false);
        return;
      }
      const u = json.data;
      setUsers((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                name: u.name,
                email: u.email,
                stores: u.stores ?? row.stores,
                storeCount: u._count?.stores ?? row.storeCount,
              }
            : row
        )
      );
      setEditingId(null);
      router.refresh();
    } catch {
      setEditError("Network error while updating user");
    } finally {
      setEditSaving(false);
    }
  }

  async function onDelete(u: UserRow) {
    if (!confirm(`Delete user "${u.name || u.email}" and their ${u.storeCount} store(s)? This cannot be undone.`)) {
      return;
    }
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "Could not delete user");
      return;
    }
    setUsers((prev) => prev.filter((row) => row.id !== u.id));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">
            Add team members or store owners. Each user signs in with their own credentials and manages their own stores,
            listings, and orders independently.
          </p>
        </div>
        {!adding && <Button onClick={() => setAdding(true)}>+ Add user</Button>}
      </div>

      {adding && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800">Create new user</h3>
              <p className="text-xs text-slate-500">
                Once created, they can sign in at <code className="rounded bg-slate-100 px-1 py-0.5">/login</code> and add
                their own stores.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </CardHeader>
          <CardBody>
            <form onSubmit={onCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  autoFocus
                />
              </Field>
              <Field label="Email *">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
                  required
                />
              </Field>
              <Field label="Password *" hint="At least 8 characters">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
              </Field>
              {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
              <div className="flex justify-end gap-2 sm:col-span-3">
                <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Creating…" : "Create user"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {users.length === 0 ? (
        <EmptyState
          title="No users found"
          desc="Add a user so they can sign in and manage their own stores."
          action={<Button onClick={() => setAdding(true)}>+ Add user</Button>}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Own Stores</th>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const isEditing = editingId === u.id;
                  return (
                    <tr key={u.id} className="align-top transition hover:bg-slate-50/80">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-50 to-indigo-100 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-500/20">
                            {(u.name || u.email || "U").trim().charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <span className="font-semibold text-slate-900">{u.name || "—"}</span>
                            {isSelf && (
                              <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-600/20">
                                You
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{u.email}</td>
                      <td className="px-6 py-4">
                        {u.stores.length === 0 ? (
                          <span className="text-xs text-slate-400">No stores yet</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {u.stores.map((s) => (
                              <Badge key={s.id}>
                                {s.name} · {s.platform} ({s.currency})
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500">{fmtDate(u.createdAt)}</td>
                      <td className="px-6 py-4 text-right">
                        {isEditing ? (
                          <form onSubmit={(e) => onUpdate(e, u.id)} className="mt-1 space-y-2 text-left">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="Name"
                              />
                              <Input
                                type="email"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                placeholder="Email"
                                required
                              />
                              <Input
                                type="password"
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                placeholder="New password (optional)"
                                minLength={8}
                              />
                            </div>
                            {editError && <p className="text-xs text-red-600">{editError}</p>}
                            <div className="flex justify-end gap-1.5">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </Button>
                              <Button type="submit" size="sm" disabled={editSaving}>
                                {editSaving ? "Saving…" : "Save"}
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => startEdit(u)}>
                              Edit
                            </Button>
                            {!isSelf && (
                              <Button variant="ghost" size="sm" onClick={() => onDelete(u)}>
                                Delete
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

