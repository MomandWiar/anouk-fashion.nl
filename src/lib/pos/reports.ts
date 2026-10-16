import { amsHourWeekday, vatIncluded } from "./money";

export type RSale = { id: string; created_at: string; total_cents: number; goods_cents: number; giftcard_issue_cents: number; discount_cents: number; is_test: boolean; exchange_return_id?: string | null; local?: boolean };
export type RLine = { sale_id: string; kind: string; description: string; category_id: string | null; product_id: string | null; size: string | null; color: string | null; qty: number; original_cents: number; discount_cents: number; final_cents: number; cost_cents: number | null; price_overridden: boolean; discount_note: string | null };
export type RPayment = { sale_id: string; method: string; amount_cents: number };
export type RReturn = { id: string; created_at: string; refund_total_cents: number; refund_paid_cents: number; refund_method: string | null; is_test: boolean };
export type RReturnLine = { return_id: string; category_id: string | null; product_id: string | null; qty: number; amount_cents: number; description: string };

export type Report = {
  revenue_cents: number; // goods sold minus refunds, incl. VAT
  vat_cents: number;
  revenue_ex_vat_cents: number;
  sales_count: number;
  avg_receipt_cents: number;
  discount_cents: number;
  price_changes: number;
  byMethod: Record<string, number>;
  byCategory: Record<string, number>;
  topItems: { name: string; qty: number; cents: number }[];
  topSizes: { name: string; qty: number }[];
  topColors: { name: string; qty: number }[];
  byHour: number[];
  byWeekday: number[];
  giftcards_issued_cents: number;
  giftcards_redeemed_cents: number;
  gross_profit_cents: number;
  profit_lines_missing_cost: number;
  includes_unsynced: number;
};

/**
 * Revenue rules: gift-card issue is not revenue (it is a liability); goods paid by gift card are revenue.
 * Refunds are subtracted on the refund date. Test sales are excluded.
 */
export function buildReport(sales: RSale[], lines: RLine[], payments: RPayment[], returns: RReturn[], returnLines: RReturnLine[], catName: (id: string | null) => string): Report {
  const real = sales.filter((s) => !s.is_test);
  const ids = new Set(real.map((s) => s.id));
  const rets = returns.filter((r) => !r.is_test);
  const retIds = new Set(rets.map((r) => r.id));
  const L = lines.filter((l) => ids.has(l.sale_id));
  const goodsLines = L.filter((l) => l.kind !== "giftcard");
  const RL = returnLines.filter((r) => retIds.has(r.return_id));

  const refunds = rets.reduce((a, r) => a + r.refund_total_cents, 0);
  const goods = real.reduce((a, s) => a + s.goods_cents, 0);
  const revenue = goods - refunds;
  const vat = vatIncluded(revenue);

  const byMethod: Record<string, number> = {};
  for (const p of payments.filter((p) => ids.has(p.sale_id))) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount_cents;
  for (const r of rets) if (r.refund_paid_cents > 0 && r.refund_method) byMethod[r.refund_method] = (byMethod[r.refund_method] ?? 0) - r.refund_paid_cents;

  const byCategory: Record<string, number> = {};
  for (const l of goodsLines) { const k = catName(l.category_id); byCategory[k] = (byCategory[k] ?? 0) + l.final_cents; }
  for (const r of RL) { const k = catName(r.category_id); byCategory[k] = (byCategory[k] ?? 0) - r.amount_cents; }

  const agg = (key: (l: RLine) => string | null) => {
    const m = new Map<string, { qty: number; cents: number }>();
    for (const l of goodsLines) { const k = key(l); if (!k) continue; const v = m.get(k) ?? { qty: 0, cents: 0 }; v.qty += l.qty; v.cents += l.final_cents; m.set(k, v); }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty || b.cents - a.cents);
  };

  const byHour = Array(24).fill(0) as number[];
  const byWeekday = Array(7).fill(0) as number[];
  for (const s of real) { const { hour, weekday } = amsHourWeekday(s.created_at); byHour[hour] += s.goods_cents; byWeekday[weekday] += s.goods_cents; }

  let profit = 0, missing = 0;
  for (const l of goodsLines) {
    if (l.cost_cents == null) { missing++; continue; }
    profit += l.final_cents - vatIncluded(l.final_cents) - l.cost_cents * l.qty;
  }

  const completed = real.filter((s) => !s.exchange_return_id && s.goods_cents > 0).length;
  return {
    revenue_cents: revenue,
    vat_cents: vat,
    revenue_ex_vat_cents: revenue - vat,
    sales_count: completed,
    avg_receipt_cents: completed ? Math.round(real.filter((s) => !s.exchange_return_id).reduce((a, s) => a + s.goods_cents, 0) / completed) : 0,
    discount_cents: goodsLines.reduce((a, l) => a + l.discount_cents, 0),
    price_changes: goodsLines.filter((l) => l.price_overridden).length,
    byMethod, byCategory,
    topItems: agg((l) => l.description).slice(0, 15).map(({ name, qty, cents }) => ({ name, qty, cents })),
    topSizes: agg((l) => l.size).slice(0, 10).map(({ name, qty }) => ({ name, qty })),
    topColors: agg((l) => l.color).slice(0, 10).map(({ name, qty }) => ({ name, qty })),
    byHour, byWeekday,
    giftcards_issued_cents: real.reduce((a, s) => a + s.giftcard_issue_cents, 0),
    giftcards_redeemed_cents: byMethod["giftcard"] ?? 0,
    gross_profit_cents: profit,
    profit_lines_missing_cost: missing,
    includes_unsynced: real.filter((s) => s.local).length,
  };
}
