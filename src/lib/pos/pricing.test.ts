import { describe, expect, it } from "vitest";
import { allocate, parseEuro, vatIncluded } from "./money";
import { cashChange, expectedCash, priceCart, refundForLine, type CartLine, type Promotion } from "./pricing";

const base = (o: Partial<CartLine>): CartLine => ({
  key: Math.random().toString(),
  kind: "product",
  description: "x",
  qty: 1,
  unit_price_cents: 1000,
  list_price_cents: 1000,
  stock_mode: "none",
  ...o,
});
const promo: Promotion = {
  id: "p1", name: "2 voor €15", qty: 2, price_cents: 1500, product_ids: [], category_ids: ["tops"],
  starts_on: null, ends_on: null, active: true,
};

describe("kassa rekenregels", () => {
  it("losse broek voor €12", () => {
    const t = priceCart([base({ kind: "loose", unit_price_cents: 1200, list_price_cents: 1200 })], [], null, "2026-10-07");
    expect(t.total_cents).toBe(1200);
  });
  it("bedragen met komma en punt", () => {
    expect(parseEuro("12,00")).toBe(1200);
    expect(parseEuro("12.5")).toBe(1250);
    expect(parseEuro("1.234,56")).toBe(123456);
    expect(parseEuro("abc")).toBeNull();
  });
  it("21% btw inclusief", () => {
    expect(vatIncluded(12100)).toBe(2100);
  });
  it("2 voor €15 actie", () => {
    const t = priceCart(
      [base({ category_id: "tops", unit_price_cents: 1000 }), base({ category_id: "tops", unit_price_cents: 900 })],
      [promo], null, "2026-10-07",
    );
    expect(t.total_cents).toBe(1500);
    expect(t.lines.map((l) => l.final_cents).reduce((a, b) => a + b)).toBe(1500);
  });
  it("actie stapelt niet met handmatige korting", () => {
    const t = priceCart(
      [
        base({ category_id: "tops", manual_discount: { type: "percent", value: 10 } }),
        base({ category_id: "tops" }),
      ],
      [promo], { type: "percent", value: 50 }, "2026-10-07",
    );
    // line 1: 10% = 900; line 2: no promo partner, gets cart discount 50% = 500
    expect(t.total_cents).toBe(1400);
  });
  it("verdeling telt exact op", () => {
    expect(allocate(500, [1000, 900]).reduce((a, b) => a + b)).toBe(500);
    expect(allocate(1, [1, 1, 1])).toEqual([1, 0, 0]);
  });
  it("gedeeltelijke retour krijgt toegewezen actiebedrag terug", () => {
    // 2x top for €15 on one line (2 x €10)
    const t = priceCart([base({ category_id: "tops", qty: 2 })], [promo], null, "2026-10-07");
    const l = t.lines[0];
    expect(l.final_cents).toBe(1500);
    const first = refundForLine(l.final_cents, 2, 0, 0, 1);
    expect(first).toBe(750);
    expect(refundForLine(l.final_cents, 2, 1, first, 1)).toBe(750);
    expect(() => refundForLine(l.final_cents, 2, 2, 1500, 1)).toThrow();
  });
  it("contant met wisselgeld", () => {
    expect(cashChange(1250, 2000)).toEqual({ amount_cents: 1250, change_cents: 750, tendered_cents: 2000 });
  });
  it("verwacht eindgeld", () => {
    expect(expectedCash({ start: 10000, cash_sales: 5000, inleg: 1000, cash_refunds: 1200, uitgave: 500, kasuitname: 8000 })).toBe(6300);
  });
});
