"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";

const FEE_HINT: Record<string, string> = {
  ETSY: "Etsy ~6.5% + payment fees",
  EBAY: "eBay ~12-13% final value fee",
};

export function StoreForm({
  initial,
  storeId,
  onDone,
}: {
  initial?: Partial<{ name: string; platform: string; currency: string; feePercent: number; notes: string }>;
  storeId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [platform, setPlatform] = useState(initial?.platform ?? "ETSY");
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [feePercent, setFeePercent] = useState(String(initial?.feePercent ?? 0));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(storeId ? `/api/stores/${storeId}` : "/api/stores", {
      method: storeId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, platform, currency, feePercent: Number(feePercent), notes }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to save store");
      return;
    }
    router.refresh();
    onDone?.();
    if (!storeId && data.data?.id) router.push(`/stores/${data.data.id}`);
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-slate-800">{storeId ? "Edit store" : "New store (environment)"}</h3>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Store name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="My Etsy Store" />
          </Field>
          <Field label="Platform">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="ETSY">Etsy</option>
              <option value="EBAY">eBay</option>
              <option value="SHOPIFY">Shopify</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Selling currency">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="EUR">EUR (€)</option>
            </Select>
          </Field>
          <Field label="Fee %" hint={FEE_HINT[platform] || "Marketplace + payment fee used in profit calc"}>
            <Input type="number" step="0.01" min="0" max="100" value={feePercent} onChange={(e) => setFeePercent(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : storeId ? "Save changes" : "Create store"}
            </Button>
            {onDone && (
              <Button type="button" variant="secondary" onClick={onDone}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
