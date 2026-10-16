// Device-local hardware links: cash drawer (ESC/POS kick via Web Serial) and label printer (browser print).
type SerialPortLike = { open(o: { baudRate: number }): Promise<void>; close(): Promise<void>; writable: WritableStream<Uint8Array> | null; readable: unknown };
type SerialLike = { requestPort(): Promise<SerialPortLike>; getPorts(): Promise<SerialPortLike[]> };
const serial = (): SerialLike | null => (typeof navigator !== "undefined" && "serial" in navigator ? (navigator as unknown as { serial: SerialLike }).serial : null);

const DRAWER_AUTO = "anouk-drawer-auto";
const LABEL_KEY = "anouk-label-settings";

export const drawerSupported = () => !!serial();
export const drawerAutoEnabled = () => typeof localStorage !== "undefined" && localStorage.getItem(DRAWER_AUTO) === "1";
export const setDrawerAuto = (v: boolean) => localStorage.setItem(DRAWER_AUTO, v ? "1" : "0");

export async function drawerLinked(): Promise<boolean> {
  const s = serial();
  return !!s && (await s.getPorts()).length > 0;
}
/** Must be called from a click: browser shows the port picker. */
export async function linkDrawer(): Promise<boolean> {
  const s = serial();
  if (!s) return false;
  try { await s.requestPort(); return true; } catch { return false; }
}

/** ESC p 0 25 250 — standard ESC/POS drawer kick on pin 2. */
export const DRAWER_KICK = new Uint8Array([27, 112, 0, 25, 250]);

export async function openDrawer(): Promise<"ok" | "not_linked" | "error"> {
  const s = serial();
  if (!s) return "not_linked";
  const [port] = await s.getPorts();
  if (!port) return "not_linked";
  try {
    if (!port.writable) await port.open({ baudRate: 9600 });
    const w = port.writable!.getWriter();
    await w.write(DRAWER_KICK);
    w.releaseLock();
    return "ok";
  } catch {
    return "error";
  }
}

export type LabelSettings = { enabled: boolean; auto: boolean; width_mm: number; height_mm: number };
export const defaultLabel: LabelSettings = { enabled: false, auto: true, width_mm: 50, height_mm: 30 };
export function getLabelSettings(): LabelSettings {
  try { return { ...defaultLabel, ...JSON.parse(localStorage.getItem(LABEL_KEY) ?? "{}") }; } catch { return defaultLabel; }
}
export const setLabelSettings = (s: LabelSettings) => localStorage.setItem(LABEL_KEY, JSON.stringify(s));

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function printLabel(item: { name: string; barcode: string; price_cents: number; size?: string | null }, copies = 1): Promise<boolean> {
  const ls = getLabelSettings();
  const { default: JsBarcode } = await import("jsbarcode");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, item.barcode, { format: /^\d{13}$/.test(item.barcode) ? "EAN13" : "CODE128", height: 40, fontSize: 12, margin: 0, width: 1.6 });
  } catch { JsBarcode(svg, item.barcode, { format: "CODE128", height: 40, fontSize: 12, margin: 0, width: 1.6 }); }
  const price = (item.price_cents / 100).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
  const one = `<div class="l"><div class="n">${esc(item.name)}${item.size ? ` · ${esc(item.size)}` : ""}</div>${svg.outerHTML}<div class="p">${price}</div></div>`;
  const html = `<!doctype html><html><head><title>Etiket</title><style>@page{size:${ls.width_mm}mm ${ls.height_mm}mm;margin:0}body{margin:0;font-family:Arial,sans-serif}.l{width:${ls.width_mm}mm;height:${ls.height_mm}mm;box-sizing:border-box;padding:1.5mm;display:flex;flex-direction:column;align-items:center;justify-content:space-between;page-break-after:always;overflow:hidden}.n{font-size:9pt;font-weight:bold;white-space:nowrap;overflow:hidden;max-width:100%}svg{max-width:100%;height:auto;max-height:60%}.p{font-size:11pt;font-weight:bold}</style></head><body>${one.repeat(Math.max(1, copies))}</body></html>`;
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  document.body.appendChild(f);
  const d = f.contentDocument;
  if (!d) return false;
  d.open(); d.write(html); d.close();
  await new Promise((r) => setTimeout(r, 200));
  try { f.contentWindow!.focus(); f.contentWindow!.print(); } catch { return false; } finally { setTimeout(() => f.remove(), 2000); }
  return true;
}
