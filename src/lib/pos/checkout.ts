import { amsDay, vatIncluded } from "./money";
import type { CartTotals } from "./pricing";
import type { ReceiptSnapshot } from "./local-db";
import { nextReceiptNumber, queueAdd, receiptSave } from "./local-db";
import { isNetworkError, submitSale } from "./sync";
import { supabase } from "@/integrations/supabase/client";
import type { Employee, Settings } from "./store";
import { REGISTER_ID } from "./store";

export type PendingPayment = {
  id: string;
  method: "cash" | "pin" | "giftcard" | "exchange_credit";
  amount_cents: number;
  tendered_cents?: number;
  change_cents?: number;
  gift_card_code?: string;
  manual?: boolean;
  attempt_id?: string;
};

export function uuid() {
  return crypto.randomUUID();
}

export function giftCardCode(): string {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return ("9" + String(a[0]).padStart(10, "0") + String(a[1] % 100).padStart(2, "0")).slice(0, 13);
}

export async function serverMaxSeqToday(): Promise<number> {
  const day = amsDay();
  const prefix = REGISTER_ID + day.replace(/-/g, "").slice(2);
  const { data } = await supabase.from("sales").select("receipt_number").like("receipt_number", `${prefix}%`)
    .order("receipt_number", { ascending: false }).limit(1);
  const rn = data?.[0]?.receipt_number;
  return rn ? parseInt(rn.slice(-4), 10) : 0;
}

export function buildSnapshot(args: {
  settings: Settings | null; receipt_number: string; created_at: string; employee: Employee;
  totals: CartTotals; payments: PendingPayment[]; is_test: boolean;
}): ReceiptSnapshot {
  const s = args.settings;
  const goods = args.totals.goods_cents;
  const vat = vatIncluded(goods);
  return {
    shop: {
      name: s?.shop_name ?? "Anouk Fashion", address: s?.address ?? "Lorentsplein 14", postal_city: s?.postal_city ?? "2522 EB Den Haag",
      logo: s?.logo_data_url ?? null, thank_you: s?.thank_you_text ?? "", return_text: s?.return_text ?? "",
    },
    receipt_number: args.receipt_number,
    created_at: args.created_at,
    employee: args.employee.name,
    lines: args.totals.lines.map((l) => ({
      description: [l.description, l.size, l.color].filter(Boolean).join(" "),
      qty: l.qty, unit_price_cents: l.unit_price_cents, original_cents: l.original_cents,
      discount_cents: l.discount_cents, final_cents: l.final_cents, note: l.discount_note, gift_card_code: l.gift_card_code,
    })),
    total_cents: args.totals.total_cents,
    discount_cents: args.totals.discount_cents,
    vat: goods > 0 ? [{ rate: 21, base_cents: goods - vat, vat_cents: vat }] : [],
    giftcard_note: args.totals.giftcard_cents > 0 ? "Cadeaubon: geen btw bij uitgifte" : null,
    payments: args.payments.map((p) => ({ method: p.method, amount_cents: p.amount_cents, tendered_cents: p.tendered_cents ?? null, change_cents: p.change_cents ?? null, manual: p.manual })),
    is_test: args.is_test,
  };
}

export function buildPayload(args: {
  sale_id: string; receipt_number: string; created_at: string; session_id: string; employee: Employee;
  totals: CartTotals; payments: PendingPayment[]; is_test: boolean; offline: boolean; snapshot: ReceiptSnapshot;
}) {
  return {
    id: args.sale_id,
    receipt_number: args.receipt_number,
    register_id: REGISTER_ID,
    cash_session_id: args.session_id,
    employee_id: args.employee.id,
    created_at: args.created_at,
    is_test: args.is_test,
    offline: args.offline,
    lines: args.totals.lines.map((l) => ({
      kind: l.kind, product_id: l.product_id ?? null, category_id: l.category_id ?? null, description: l.description,
      size: l.size ?? null, color: l.color ?? null, qty: l.qty, unit_price_cents: l.unit_price_cents,
      original_cents: l.original_cents, discount_cents: l.discount_cents, final_cents: l.final_cents,
      discount_note: l.discount_note, promotion_id: l.promotion_id, price_overridden: !!l.price_overridden,
      stock_mode: l.stock_mode, cost_cents: l.cost_cents ?? null, oversold: !!l.oversold, gift_card_code: l.gift_card_code ?? null,
    })),
    payments: args.payments.map((p) => ({
      method: p.method, amount_cents: p.amount_cents, tendered_cents: p.tendered_cents ?? null, change_cents: p.change_cents ?? null,
      gift_card_code: p.gift_card_code ?? null, manual: p.manual ?? true,
    })),
    attempt_ids: args.payments.filter((p) => p.attempt_id).map((p) => p.attempt_id),
    snapshot: args.snapshot,
  };
}

/**
 * Finalises a sale. Online: atomic server transaction. Offline (or network drop): stored durably
 * in the local queue first, then synced later with the same id (idempotent).
 */
export async function finalizeSale(args: {
  sale_id: string; online: boolean; settings: Settings | null; session_id: string; employee: Employee;
  totals: CartTotals; payments: PendingPayment[];
}): Promise<{ snapshot: ReceiptSnapshot; queued: boolean }> {
  const day = amsDay();
  let maxSeq = 0;
  if (args.online) { try { maxSeq = await serverMaxSeqToday(); } catch { /* ignore */ } }
  const receipt_number = await nextReceiptNumber(REGISTER_ID, day, maxSeq);
  const created_at = new Date().toISOString();
  const is_test = !!args.settings?.test_mode;
  const snapshot = buildSnapshot({ settings: args.settings, receipt_number, created_at, employee: args.employee, totals: args.totals, payments: args.payments, is_test });
  const needsCentral = args.payments.some((p) => p.method === "giftcard") || args.totals.giftcard_cents > 0;

  const payload = (offline: boolean) => buildPayload({ ...args, receipt_number, created_at, is_test, offline, snapshot });

  const queue = async () => {
    if (needsCentral) throw new Error("Cadeaubonnen vereisen een internetverbinding.");
    await queueAdd({ id: args.sale_id, kind: "sale", payload: payload(true), status: "pending", attempts: 0, created_at });
    await receiptSave({ receipt_number, sale_id: args.sale_id, created_at, snapshot, synced: false });
    return { snapshot, queued: true };
  };

  if (!args.online) return queue();
  try {
    await submitSale(payload(false));
    await receiptSave({ receipt_number, sale_id: args.sale_id, created_at, snapshot, synced: true });
    return { snapshot, queued: false };
  } catch (e) {
    if (isNetworkError(e)) return queue();
    throw e;
  }
}
