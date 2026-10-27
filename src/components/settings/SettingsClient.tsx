"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select } from "@/components/ui";

interface StoreLite {
  id: string;
  name: string;
  currency: string;
}
interface Account {
  id: string;
  label: string;
  emailMasked: string;
  provider: string;
}

export function SettingsClient({ stores }: { stores: StoreLite[] }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [trackingProvider, setTrackingProvider] = useState("none");
  const [trackingApiKey, setTrackingApiKey] = useState("");
  const [savingTracking, setSavingTracking] = useState(false);
  const [trackingMsg, setTrackingMsg] = useState<string | null>(null);

  async function load(id: string) {
    if (!id) return;
    const res = await fetch(`/api/supplier-accounts?storeId=${id}`);
    const data = await res.json();
    if (res.ok) setAccounts(data.data);
  }

  useEffect(() => {
    load(storeId);
  }, [storeId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const json = await res.json();
        if (res.ok && json.data) {
          setTrackingProvider(json.data.trackingProvider || "none");
          setTrackingApiKey(json.data.trackingApiKey || "");
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function saveTracking(e: React.FormEvent) {
    e.preventDefault();
    setSavingTracking(true);
    setTrackingMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackingProvider, trackingApiKey: trackingApiKey.trim() }),
      });
      if (!res.ok) throw new Error("save failed");
      setTrackingMsg(
        trackingProvider === "none"
          ? "Saved. Customer parcels will use manual status + deep-link."
          : "Saved. Hit Refresh on a customer shipment to pull live status."
      );
    } catch {
      setTrackingMsg("Couldn't save. Try again.");
    } finally {
      setSavingTracking(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/supplier-accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId, label, email, provider: "aliexpress" }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to add account");
      return;
    }
    setLabel("");
    setEmail("");
    load(storeId);
  }

  async function remove(id: string) {
    await fetch(`/api/supplier-accounts/${id}`, { method: "DELETE" });
    load(storeId);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Supplier purchase accounts and app configuration.</p>
      </div>

      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-800">Supplier purchase accounts</h3>
          <p className="text-sm text-slate-500">
            The email addresses you use to buy from suppliers (AliExpress). Stored encrypted; you pick one when recording a
            purchase. Only a masked version is ever shown.
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          {stores.length === 0 ? (
            <p className="text-sm text-slate-500">Create a store first.</p>
          ) : (
            <>
              <Field label="Store">
                <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="space-y-2">
                {accounts.length === 0 && <p className="text-sm text-slate-400">No accounts yet.</p>}
                {accounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{a.label}</p>
                      <p className="text-xs text-slate-500">
                        {a.emailMasked} <Badge>{a.provider}</Badge>
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => remove(a.id)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              <form onSubmit={add} className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
                <Field label="Label">
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main buyer" required />
                </Field>
                <Field label="Account email">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="buyer@gmail.com" required />
                </Field>
                <div className="flex items-end">
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Adding…" : "Add account"}
                  </Button>
                </div>
                {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
              </form>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-800">Live carrier tracking (FedEx / USPS / UPS)</h3>
          <p className="text-sm text-slate-500">
            There is no keyless carrier API. Create a free account with a tracking aggregator — one key covers all
            carriers — then paste the key here. Without it, customer parcels use the manual status control + a live
            deep-link to the carrier.
          </p>
        </CardHeader>
        <CardBody>
          <form onSubmit={saveTracking} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Provider">
              <Select value={trackingProvider} onChange={(e) => setTrackingProvider(e.target.value)}>
                <option value="none">None (manual + deep-link)</option>
                <option value="aftership">AfterShip (free tier)</option>
                <option value="trackingmore">TrackingMore</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="API key"
                hint={
                  trackingProvider === "aftership"
                    ? "Get a free key at aftership.com → Settings → API keys"
                    : trackingProvider === "trackingmore"
                      ? "Get a key at trackingmore.com → API"
                      : "Pick a provider to enter a key"
                }
              >
                <Input
                  type="password"
                  value={trackingApiKey}
                  onChange={(e) => setTrackingApiKey(e.target.value)}
                  placeholder="Paste your API key"
                  disabled={trackingProvider === "none"}
                  autoComplete="off"
                />
              </Field>
            </div>
            <div className="flex items-center gap-3 sm:col-span-3">
              <Button type="submit" disabled={savingTracking}>
                {savingTracking ? "Saving…" : "Save tracking settings"}
              </Button>
              {trackingMsg && <span className="text-sm text-slate-500">{trackingMsg}</span>}
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-800">How tracking & currency work</h3>
        </CardHeader>
        <CardBody className="space-y-2 text-sm text-slate-600">
          <p>• Supplier parcels are tracked via Cainiao Global and auto-refreshed every 6 hours until delivered.</p>
          <p>• Customer parcels (FedEx/USPS/UPS) show status when a tracking provider is configured; otherwise a live deep-link.</p>
          <p>• Currency is auto-converted (ECB rates) so profit always shows in each store's own currency.</p>
        </CardBody>
      </Card>
    </div>
  );
}
