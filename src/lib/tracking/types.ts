import type { ShipmentStatus } from "@prisma/client";

export interface NormalizedEvent {
  time: Date;
  status: string; // provider's status text / action code
  location?: string;
  description: string;
}

export interface NormalizedResult {
  found: boolean; // did the provider recognise the number at all
  status: ShipmentStatus;
  statusDetail?: string; // latest human-readable status line
  carrierCode?: string;
  carrierName?: string;
  estimatedDelivery?: Date | null;
  delivered: boolean;
  events: NormalizedEvent[];
  raw?: unknown; // original payload, for debugging
}

export interface TrackingProvider {
  /** Stable code: "cainiao", "fedex", ... */
  code: string;
  /** Fetch + normalize tracking for one number. Should resolve (never throw) on network/parse errors. */
  fetch(trackingNumber: string): Promise<NormalizedResult>;
  /** Public URL a human can open to view this tracking. */
  deepLink(trackingNumber: string): string;
}

export function emptyResult(found = false): NormalizedResult {
  return { found, status: "PENDING", delivered: false, events: [] };
}
