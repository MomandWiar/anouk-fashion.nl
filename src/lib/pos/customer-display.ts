export type DisplayLine = { key: string; description: string; qty: number; unit_cents: number; final_cents: number; discount_cents: number };
export type DisplayState = { phase: "welcome" | "cart" | "complete"; lines: DisplayLine[]; total_cents: number; discount_cents: number; paid_cents: number; change_cents: number; methods: string[]; updated_at: number };
export const DISPLAY_KEY = "anouk-customer-display-state";
export const DISPLAY_SETTING = "anouk-customer-display-enabled";
const CHANNEL = "anouk-customer-display";
let displayWindow: Window | null = null;
export const welcomeDisplay = (): DisplayState => ({ phase: "welcome", lines: [], total_cents: 0, discount_cents: 0, paid_cents: 0, change_cents: 0, methods: [], updated_at: Date.now() });
export function customerDisplayEnabled() { return localStorage.getItem(DISPLAY_SETTING) !== "false"; }
export function publishDisplay(state: DisplayState) {
  const safe = customerDisplayEnabled() ? { ...state, updated_at: Date.now() } : welcomeDisplay();
  localStorage.setItem(DISPLAY_KEY, JSON.stringify(safe));
  if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel(CHANNEL); channel.postMessage(safe); channel.close(); }
}
export function readDisplay(): DisplayState {
  try { const raw = localStorage.getItem(DISPLAY_KEY); if (!raw || !customerDisplayEnabled()) return welcomeDisplay(); const value = JSON.parse(raw) as DisplayState; return Date.now() - value.updated_at < 30000 ? value : welcomeDisplay(); } catch { return welcomeDisplay(); }
}
export function subscribeDisplay(onChange: () => void) {
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
  channel?.addEventListener("message", onChange);
  window.addEventListener("storage", onChange);
  return () => { channel?.close(); window.removeEventListener("storage", onChange); };
}
export function setCustomerDisplayEnabled(enabled: boolean) {
  localStorage.setItem(DISPLAY_SETTING, String(enabled));
  if (!enabled) { publishDisplay(welcomeDisplay()); displayWindow?.close(); displayWindow = null; }
  window.dispatchEvent(new Event("anouk-display-settings"));
}
type ScreenDetail = { left: number; top: number; width: number; height: number; isPrimary: boolean };
type MultiScreenWindow = Window & { getScreenDetails?: () => Promise<{ screens: ScreenDetail[] }> };
export async function openCustomerDisplay(requestScreen = false): Promise<"open" | "blocked" | "manual"> {
  if (displayWindow && !displayWindow.closed) { if (requestScreen) displayWindow.focus(); return "open"; }
  // Open synchronously while a settings click still carries user activation.
  displayWindow = window.open("/klantendisplay", "anouk-customer-display", "popup,width=1024,height=680");
  if (!displayWindow) return "blocked";
  const multi = window as MultiScreenWindow;
  if (!multi.getScreenDetails) return "manual";
  try {
    if (!requestScreen) {
      const permission = await navigator.permissions.query({ name: "window-management" as PermissionName });
      if (permission.state !== "granted") return "manual";
    }
    const details = await multi.getScreenDetails();
    const other = details.screens.find((screen) => !screen.isPrimary);
    if (!other || !displayWindow || displayWindow.closed) return "manual";
    displayWindow.moveTo(other.left, other.top); displayWindow.resizeTo(other.width, other.height);
    return "open";
  } catch { return "manual"; }
}