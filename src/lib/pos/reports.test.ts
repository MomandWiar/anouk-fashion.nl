import { describe, expect, it } from "vitest";
import { buildReport } from "./reports";

const sale = (id: string, goods: number, extra: Partial<{ giftcard_issue_cents: number; is_test: boolean }> = {}) => ({
  id, created_at: "2026-10-07T10:00:00Z", total_cents: goods + (extra.giftcard_issue_cents ?? 0), goods_cents: goods,
  giftcard_issue_cents: extra.giftcard_issue_cents ?? 0, discount_cents: 0, is_test: extra.is_test ?? false,
});

describe("rapportage", () => {
  it("trekt terugbetalingen af van de omzet", () => {
    const r = buildReport([sale("a", 5000)], [], [{ sale_id: "a", method: "cash", amount_cents: 5000 }],
      [{ id: "r", created_at: "2026-10-07T12:00:00Z", refund_total_cents: 1500, refund_paid_cents: 1500, refund_method: "cash", is_test: false }], [], () => "x");
    expect(r.revenue_cents).toBe(3500);
    expect(r.byMethod.cash).toBe(3500);
  });
  it("cadeaubon uitgifte is geen omzet, besteding wel", () => {
    const r = buildReport(
      [sale("a", 0, { giftcard_issue_cents: 5000 }), sale("b", 3000)], [],
      [{ sale_id: "a", method: "pin", amount_cents: 5000 }, { sale_id: "b", method: "giftcard", amount_cents: 3000 }], [], [], () => "x");
    expect(r.revenue_cents).toBe(3000);
    expect(r.giftcards_issued_cents).toBe(5000);
  });
  it("testverkopen tellen niet mee", () => {
    const r = buildReport([sale("a", 5000, { is_test: true })], [], [], [], [], () => "x");
    expect(r.revenue_cents).toBe(0);
  });
});
