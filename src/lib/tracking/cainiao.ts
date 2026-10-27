import type { ShipmentStatus } from "@prisma/client";
import { NormalizedEvent, NormalizedResult, TrackingProvider, emptyResult } from "./types";

const API_BASE = process.env.CAINIAO_API_BASE || "https://global.cainiao.com/global/detail.json";

// Map Cainiao's status / actionCode vocabulary onto our ShipmentStatus enum.
function mapStatus(status: string | undefined, actionCode: string | undefined): ShipmentStatus {
  const s = `${status || ""} ${actionCode || ""}`.toUpperCase();
  if (/SIGNIN_EXC|EXC|RETURN|FAIL|REJECT|ABNORMAL/.test(s)) return "EXCEPTION";
  if (/SIGNIN|SIGNED|DELIVERED/.test(s)) return "DELIVERED";
  if (/DELIVERING|OUT_FOR_DELIVERY|DISPATCH/.test(s)) return "OUT_FOR_DELIVERY";
  if (/ORDER_NOT_EXISTS|NOT_FOUND|NOT_EXIST/.test(s)) return "UNKNOWN";
  if (/SHIPPING|TRANSPORT|DEPART|ARRIVE|ACCEPT|PICKED|SORT|CUSTOM|FLIGHT|SC_/.test(s)) return "IN_TRANSIT";
  if (/WAIT4PICKUP|WAIT4SIGNIN|PACKED|INFO|CREATE|ORDER/.test(s)) return "INFO_RECEIVED";
  return "PENDING";
}

interface CainiaoDetail {
  time?: number;
  timeStr?: string;
  desc?: string;
  standerdDesc?: string;
  actionCode?: string;
  timeZone?: string;
  group?: { nodeDesc?: string };
}

interface CainiaoModule {
  mailNo?: string;
  status?: string;
  statusDesc?: string;
  originCountry?: string;
  destCountry?: string;
  daysNumber?: string;
  detailList?: CainiaoDetail[];
  latestTrace?: CainiaoDetail;
}

function parseEvent(d: CainiaoDetail): NormalizedEvent {
  const time = d.time ? new Date(d.time) : d.timeStr ? new Date(d.timeStr.replace(" ", "T")) : new Date();
  const description = d.standerdDesc || d.desc || d.group?.nodeDesc || "Update";
  // standerdDesc often embeds location in brackets e.g. "[USA,Queens] Arrived ..."
  let location: string | undefined;
  const m = /^\[([^\]]+)\]/.exec(d.standerdDesc || "");
  if (m) location = m[1];
  return { time, status: d.actionCode || d.group?.nodeDesc || "UPDATE", location, description };
}

export const cainiaoProvider: TrackingProvider = {
  code: "cainiao",

  deepLink(trackingNumber: string): string {
    return `https://global.cainiao.com/newDetail.htm?mailNoList=${encodeURIComponent(trackingNumber)}`;
  },

  async fetch(trackingNumber: string): Promise<NormalizedResult> {
    const url = `${API_BASE}?mailNos=${encodeURIComponent(trackingNumber)}&lang=en-US`;
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          accept: "application/json, text/plain, */*",
          referer: `https://global.cainiao.com/newDetail.htm?mailNoList=${encodeURIComponent(trackingNumber)}`,
        },
        // Avoid hanging the worker forever
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`Cainiao HTTP ${res.status}`);
      const json = (await res.json()) as { module?: CainiaoModule[]; success?: boolean };
      const mod = json.module?.[0];
      if (!mod) return emptyResult(false);

      const details = (mod.detailList || []).map(parseEvent).sort((a, b) => b.time.getTime() - a.time.getTime());
      const found = details.length > 0 || !!mod.status;
      const latest = mod.detailList?.[0] || mod.latestTrace;
      const status = mapStatus(mod.status, latest?.actionCode);

      return {
        found,
        status,
        statusDetail: mod.statusDesc || latest?.standerdDesc || latest?.desc,
        carrierCode: "cainiao",
        carrierName: "Cainiao / AliExpress",
        estimatedDelivery: null, // Cainiao exposes "N day(s)", not an absolute date
        delivered: status === "DELIVERED",
        events: details,
        raw: mod,
      };
    } catch {
      return emptyResult(false);
    }
  },
};
