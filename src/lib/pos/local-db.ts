import { openDB, type IDBPDatabase } from "idb";

// Durable local storage (IndexedDB) for offline operation.
export type QueueItem = {
  id: string; // = sale id (idempotency key)
  kind: "sale";
  payload: Record<string, unknown>;
  status: "pending" | "error";
  error?: string;
  attempts: number;
  created_at: string;
};

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB niet beschikbaar");
  if (!dbp) {
    dbp = openDB("anouk-kassa", 1, {
      upgrade(d) {
        d.createObjectStore("cache"); // key -> value (products, categories, settings, ...)
        d.createObjectStore("queue", { keyPath: "id" });
        d.createObjectStore("receipts", { keyPath: "receipt_number" });
        d.createObjectStore("meta");
      },
    });
  }
  return dbp;
}

export async function cacheSet(key: string, value: unknown) {
  await (await db()).put("cache", value, key);
}
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("cache", key)) as T | undefined;
}
export async function metaGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("meta", key)) as T | undefined;
}
export async function metaSet(key: string, value: unknown) {
  await (await db()).put("meta", value, key);
}

export async function queueAdd(item: QueueItem) {
  const d = await db();
  const tx = d.transaction("queue", "readwrite");
  await tx.store.put(item);
  await tx.done; // durable before success is shown
}
export async function queueAll(): Promise<QueueItem[]> {
  return ((await (await db()).getAll("queue")) as QueueItem[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
}
export async function queueRemove(id: string) {
  await (await db()).delete("queue", id);
}
export async function queuePut(item: QueueItem) {
  await (await db()).put("queue", item);
}

export type LocalReceipt = { receipt_number: string; sale_id: string; created_at: string; snapshot: ReceiptSnapshot; synced: boolean };
export async function receiptSave(r: LocalReceipt) {
  await (await db()).put("receipts", r);
}
export async function receiptGet(n: string): Promise<LocalReceipt | undefined> {
  return (await (await db()).get("receipts", n)) as LocalReceipt | undefined;
}
export async function receiptsAll(): Promise<LocalReceipt[]> {
  return (await (await db()).getAll("receipts")) as LocalReceipt[];
}
export async function clearAllLocal() {
  const d = await db();
  for (const s of ["cache", "queue", "receipts", "meta"] as const) await d.clear(s);
}

/** Next receipt number: register(2) + yymmdd + seq(4). Unique per register, also offline. */
export async function nextReceiptNumber(registerId: string, day: string, serverMaxSeq = 0): Promise<string> {
  const d = await db();
  const tx = d.transaction("meta", "readwrite");
  const key = `seq:${registerId}:${day}`;
  const cur = ((await tx.store.get(key)) as number | undefined) ?? 0;
  const next = Math.max(cur, serverMaxSeq) + 1;
  await tx.store.put(next, key);
  await tx.done;
  const ymd = day.replace(/-/g, "").slice(2);
  return `${registerId.padStart(2, "0")}${ymd}${String(next).padStart(4, "0")}`;
}
export async function bumpReceiptSeq(registerId: string, day: string, serverMaxSeq: number) {
  const d = await db();
  const key = `seq:${registerId}:${day}`;
  const cur = ((await d.get("meta", key)) as number | undefined) ?? 0;
  if (serverMaxSeq > cur) await d.put("meta", serverMaxSeq, key);
}

export type ReceiptSnapshot = {
  shop: { name: string; address: string; postal_city: string; logo?: string | null; thank_you: string; return_text: string };
  receipt_number: string;
  created_at: string;
  employee: string;
  lines: { description: string; qty: number; unit_price_cents: number; original_cents: number; discount_cents: number; final_cents: number; note: string | null; gift_card_code?: string }[];
  total_cents: number;
  discount_cents: number;
  vat: { rate: number; base_cents: number; vat_cents: number }[];
  giftcard_note?: string | null;
  payments: { method: string; amount_cents: number; tendered_cents?: number | null; change_cents?: number | null; manual?: boolean }[];
  is_test?: boolean;
  exchange_credit_cents?: number;
};
