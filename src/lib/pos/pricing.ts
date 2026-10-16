import { allocate } from "./money";

export type StockMode = "detailed" | "category" | "none";

export type CartLine = {
  key: string;
  kind: "product" | "loose" | "giftcard";
  product_id?: string | null;
  category_id?: string | null;
  description: string;
  size?: string | null;
  color?: string | null;
  qty: number;
  unit_price_cents: number; // effective unit price (after manual override)
  list_price_cents: number; // catalogue price, for "prijs aangepast" note
  price_overridden?: boolean;
  manual_discount?: { type: "amount" | "percent"; value: number } | null; // amount = cents for whole line, percent = 0-100
  stock_mode: StockMode;
  cost_cents?: number | null;
  gift_card_code?: string;
  oversold?: boolean;
};

export type Promotion = {
  id: string;
  name: string;
  qty: number;
  price_cents: number;
  product_ids: string[];
  category_ids: string[];
  starts_on: string | null;
  ends_on: string | null;
  active: boolean;
};

export type CartDiscount = { type: "amount" | "percent"; value: number } | null;

export type PricedLine = CartLine & {
  original_cents: number;
  discount_cents: number;
  final_cents: number;
  discount_note: string | null;
  promotion_id: string | null;
};

export type CartTotals = {
  lines: PricedLine[];
  original_cents: number;
  discount_cents: number;
  total_cents: number;
  goods_cents: number;
  giftcard_cents: number;
};

function promoActive(p: Promotion, day: string) {
  if (!p.active) return false;
  if (p.starts_on && day < p.starts_on) return false;
  if (p.ends_on && day > p.ends_on) return false;
  return true;
}

function promoMatches(p: Promotion, l: CartLine) {
  return (
    (!!l.product_id && p.product_ids.includes(l.product_id)) ||
    (!!l.category_id && p.category_ids.includes(l.category_id))
  );
}

/**
 * Discount rules (no stacking):
 * 1. A manual line discount or manual price change excludes that line from promotions and cart discount.
 * 2. Combination promotions ("2 voor €15") are applied automatically to remaining eligible units,
 *    grouping the most expensive units first. Each unit can only be in one promotion group.
 * 3. A cart discount is spread over lines that have no other discount yet.
 * Every discount is allocated per line so partial returns refund what was actually paid.
 */
export function priceCart(
  input: CartLine[],
  promotions: Promotion[],
  cartDiscount: CartDiscount,
  day: string,
): CartTotals {
  const lines: PricedLine[] = input.map((l) => ({
    ...l,
    original_cents: l.qty * l.unit_price_cents,
    discount_cents: 0,
    final_cents: l.qty * l.unit_price_cents,
    discount_note: l.price_overridden && l.list_price_cents !== l.unit_price_cents
      ? `Prijs aangepast (was ${(l.list_price_cents / 100).toFixed(2).replace(".", ",")})`
      : null,
    promotion_id: null,
  }));

  // 1. manual line discounts
  for (const l of lines) {
    const md = l.manual_discount;
    if (!md || l.kind === "giftcard") continue;
    const d =
      md.type === "amount"
        ? Math.min(Math.max(0, Math.round(md.value)), l.original_cents)
        : Math.min(l.original_cents, Math.round((l.original_cents * Math.min(100, Math.max(0, md.value))) / 100));
    l.discount_cents = d;
    l.discount_note = [l.discount_note, md.type === "percent" ? `Korting ${md.value}%` : "Korting"].filter(Boolean).join(" · ");
  }

  // 2. combination promotions
  const used = new Map<number, number>(); // line index -> units already used by a promotion
  const isFree = (l: PricedLine) => l.kind !== "giftcard" && !l.manual_discount && !l.price_overridden;
  for (const p of promotions.filter((p) => promoActive(p, day))) {
    const units: { li: number; price: number }[] = [];
    lines.forEach((l, li) => {
      if (!isFree(l) || !promoMatches(p, l)) return;
      const avail = l.qty - (used.get(li) ?? 0);
      for (let u = 0; u < avail; u++) units.push({ li, price: l.unit_price_cents });
    });
    const groups = Math.floor(units.length / p.qty);
    if (groups === 0) continue;
    units.sort((a, b) => b.price - a.price || a.li - b.li);
    for (let g = 0; g < groups; g++) {
      const grp = units.slice(g * p.qty, (g + 1) * p.qty);
      const sum = grp.reduce((a, u) => a + u.price, 0);
      const disc = sum - p.price_cents;
      for (const u of grp) used.set(u.li, (used.get(u.li) ?? 0) + 1);
      if (disc <= 0) continue;
      const parts = allocate(disc, grp.map((u) => u.price));
      grp.forEach((u, k) => {
        const l = lines[u.li];
        l.discount_cents += parts[k];
        l.promotion_id = p.id;
        l.discount_note = p.name;
      });
    }
  }

  // 3. cart discount on lines without any discount
  if (cartDiscount && cartDiscount.value > 0) {
    const elig = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l, i }) => l.kind !== "giftcard" && l.discount_cents === 0 && !l.price_overridden && !used.get(i));
    const base = elig.reduce((a, { l }) => a + l.original_cents, 0);
    const total =
      cartDiscount.type === "amount"
        ? Math.min(base, Math.round(cartDiscount.value))
        : Math.round((base * Math.min(100, cartDiscount.value)) / 100);
    const parts = allocate(total, elig.map(({ l }) => l.original_cents));
    elig.forEach(({ l }, k) => {
      if (parts[k] <= 0) return;
      l.discount_cents += parts[k];
      l.discount_note = cartDiscount.type === "percent" ? `Bonkorting ${cartDiscount.value}%` : "Bonkorting";
    });
  }

  for (const l of lines) l.final_cents = l.original_cents - l.discount_cents;
  const sum = (f: (l: PricedLine) => number) => lines.reduce((a, l) => a + f(l), 0);
  return {
    lines,
    original_cents: sum((l) => l.original_cents),
    discount_cents: sum((l) => l.discount_cents),
    total_cents: sum((l) => l.final_cents),
    goods_cents: sum((l) => (l.kind === "giftcard" ? 0 : l.final_cents)),
    giftcard_cents: sum((l) => (l.kind === "giftcard" ? l.final_cents : 0)),
  };
}

/** Refund for returning `qty` of a sold line, matching the server rule. */
export function refundForLine(finalCents: number, soldQty: number, alreadyReturnedQty: number, alreadyRefunded: number, qty: number) {
  const remaining = soldQty - alreadyReturnedQty;
  if (qty > remaining) throw new Error("Meer retour dan verkocht");
  if (qty === remaining) return finalCents - alreadyRefunded;
  return Math.floor((finalCents * qty) / soldQty);
}

/** Cash: amount kept = tendered - change. */
export function cashChange(dueCents: number, tenderedCents: number) {
  const amount = Math.min(dueCents, tenderedCents);
  return { amount_cents: amount, change_cents: Math.max(0, tenderedCents - dueCents), tendered_cents: tenderedCents };
}

/** Expected cash at close. */
export function expectedCash(s: { start: number; cash_sales: number; inleg: number; cash_refunds: number; uitgave: number; kasuitname: number }) {
  return s.start + s.cash_sales + s.inleg - s.cash_refunds - s.uitgave - s.kasuitname;
}
