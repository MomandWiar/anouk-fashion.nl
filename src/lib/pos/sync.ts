import { supabase } from "@/integrations/supabase/client";
import { queueAll, queuePut, queueRemove, receiptGet, receiptSave } from "./local-db";

export function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return /fetch|network|Failed to fetch|Load failed|NetworkError|timeout/i.test(msg) || (typeof navigator !== "undefined" && !navigator.onLine);
}

export async function submitSale(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("complete_sale", { p: payload as never });
  if (error) throw error;
  return data as { id: string; receipt_number: string; duplicate: boolean };
}

let running: Promise<SyncResult> | null = null;
export type SyncResult = { synced: number; failed: number; pending: number; networkDown: boolean };

/** Sends queued offline sales. Idempotent: the server ignores sale ids it already has. */
export function syncQueue(): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    let synced = 0, failed = 0, networkDown = false;
    const items = await queueAll();
    for (const item of items) {
      try {
        await submitSale(item.payload);
        await queueRemove(item.id);
        const rn = String(item.payload.receipt_number);
        const r = await receiptGet(rn);
        if (r) await receiptSave({ ...r, synced: true });
        synced++;
      } catch (e) {
        if (isNetworkError(e)) { networkDown = true; break; }
        failed++;
        await queuePut({ ...item, status: "error", attempts: item.attempts + 1, error: (e as Error).message ?? String(e) });
      }
    }
    const pending = (await queueAll()).length;
    return { synced, failed, pending, networkDown };
  })().finally(() => { running = null; });
  return running;
}
