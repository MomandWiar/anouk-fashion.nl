import { describe, expect, it } from "vitest";
import { DRAWER_KICK, drawerAutoEnabled } from "./hardware";

describe("cash drawer", () => {
  it("sends the ESC/POS drawer kick ESC p 0 25 250", () => {
    expect(Array.from(DRAWER_KICK)).toEqual([27, 112, 0, 25, 250]);
  });

  it("keeps raw drawer control disabled until explicitly enabled", () => {
    localStorage.removeItem("anouk-drawer-auto");
    expect(drawerAutoEnabled()).toBe(false);
  });
});
