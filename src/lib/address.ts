/**
 * Parse a pasted shipping block (name + address) into structured fields.
 *
 * Tolerant, best-effort — tuned for the common US format Etsy produces, e.g.:
 *   Jacinda Taylor
 *   1034 Shedd Rd
 *   BREMEN, GA 30110-4027
 *   United States
 *
 * The first line is the name, a "City, ST ZIP" line is detected anywhere below it,
 * lines above that line become the street address, and any line after it is the country.
 * Anything it can't confidently place still ends up in the address field so nothing is lost.
 */
export interface ParsedAddress {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

const EMPTY: ParsedAddress = { name: "", address: "", city: "", state: "", zip: "", country: "" };

// "City, ST 30110-4027"  /  "City ST 30110"  (ST = 2 letters; postcode must contain a digit)
const CSZ = /^(.+?),?\s+([A-Za-z]{2})\.?\s+([A-Za-z0-9][A-Za-z0-9\- ]{2,10})$/;

export function parseAddressBlock(raw: string): ParsedAddress {
  const lines = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) return { ...EMPTY };

  const res: ParsedAddress = { ...EMPTY };
  res.name = lines[0];
  const rest = lines.slice(1);

  // Find the city/state/zip line, scanning from the bottom (it sits near the end).
  let cszIdx = -1;
  for (let i = rest.length - 1; i >= 0; i--) {
    const m = CSZ.exec(rest[i]);
    if (m && /\d/.test(m[3])) {
      res.city = m[1].trim();
      res.state = m[2].toUpperCase();
      res.zip = m[3].trim();
      cszIdx = i;
      break;
    }
  }

  if (cszIdx === -1) {
    // No structured line: treat a digit-free last line as the country, the rest as address.
    if (rest.length > 1 && !/\d/.test(rest[rest.length - 1])) {
      res.country = rest[rest.length - 1];
      res.address = rest.slice(0, -1).join(", ");
    } else {
      res.address = rest.join(", ");
    }
  } else {
    res.address = rest.slice(0, cszIdx).join(", ");
    const after = rest.slice(cszIdx + 1);
    if (after.length) res.country = after.join(", ");
  }

  return res;
}
