// All money is integer euro cents.
const fmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

export function euro(cents: number | null | undefined): string {
  return fmt.format((cents ?? 0) / 100);
}

/** Parses "12", "12,5", "12.50", "€ 1.234,56" into cents. Returns null when invalid. */
export function parseEuro(input: string): number | null {
  let s = input.replace(/[€\s]/g, "").trim();
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    // the last separator is the decimal separator
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** Dutch VAT included in a gross amount (21%). */
export function vatIncluded(grossCents: number, rate = 21): number {
  return Math.round((grossCents * rate) / (100 + rate));
}

/**
 * Distribute `total` cents over `weights` proportionally (largest remainder),
 * so the parts always sum exactly to `total`.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map((r) => Math.floor(r));
  let rest = total - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) parts[order[k].i] += 1;
  return parts;
}

const tz = "Europe/Amsterdam";
export function fmtDateTime(iso: string | Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: tz,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}
export function fmtDate(iso: string | Date): string {
  return new Intl.DateTimeFormat("nl-NL", { timeZone: tz, dateStyle: "medium" }).format(new Date(iso));
}
/** yyyy-mm-dd of a moment in Amsterdam time */
export function amsDay(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p;
}
/** hour (0-23) and weekday (0=ma..6=zo) in Amsterdam */
export function amsHourWeekday(iso: string): { hour: number; weekday: number } {
  const d = new Date(iso);
  const hour = parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(d), 10);
  const wd = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short" }).format(d);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return { hour, weekday: map[wd] ?? 0 };
}
/** UTC instant for 00:00 Amsterdam time on the given yyyy-mm-dd */
export function amsStartOfDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  // try both offsets (+1 / +2) and pick the one that maps back to the same day at 00:00
  for (const off of [1, 2]) {
    const cand = new Date(Date.UTC(y, m - 1, d, -off, 0, 0));
    const h = amsHourWeekday(cand.toISOString()).hour;
    if (h === 0 && amsDay(cand) === day) return cand;
  }
  return new Date(Date.UTC(y, m - 1, d, -1));
}
