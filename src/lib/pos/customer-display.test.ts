import { beforeEach, describe, expect, it } from "vitest";
import { customerDisplayEnabled, publishDisplay, readDisplay, setCustomerDisplayEnabled, welcomeDisplay } from "./customer-display";
describe("Customer display", () => {
  beforeEach(() => localStorage.clear());
  it("enables automatic startup by default", () => { expect(customerDisplayEnabled()).toBe(true); });
  it("shows the current purchase total in integer cents", () => { publishDisplay({ ...welcomeDisplay(), phase: "cart", total_cents: 2750 }); expect(readDisplay().total_cents).toBe(2750); });
  it("disabling removes purchase details from the customer display", () => { publishDisplay({ ...welcomeDisplay(), phase: "cart", total_cents: 2750 }); setCustomerDisplayEnabled(false); expect(readDisplay().phase).toBe("welcome"); expect(readDisplay().total_cents).toBe(0); });
  it("retains the completed sale and change until the next sale", () => { publishDisplay({ ...welcomeDisplay(), phase: "complete", total_cents: 2750, change_cents: 2250 }); expect(readDisplay().phase).toBe("complete"); expect(readDisplay().change_cents).toBe(2250); publishDisplay(welcomeDisplay()); expect(readDisplay().phase).toBe("welcome"); });
});