// On-screen keyboard setting (device-local, for touchscreen registers without a physical keyboard).
const OSK_KEY = "anouk-osk-enabled";
const OSK_EVENT = "anouk-osk-setting";

export function oskEnabled(): boolean {
  try {
    const v = localStorage.getItem(OSK_KEY);
    return v === null ? true : v === "1"; // default on: touchscreen register
  } catch {
    return false;
  }
}

export function setOskEnabled(on: boolean): void {
  try {
    localStorage.setItem(OSK_KEY, on ? "1" : "0");
  } catch { /* ignore */ }
  window.dispatchEvent(new Event(OSK_EVENT));
}

export function onOskSettingChange(cb: () => void): () => void {
  window.addEventListener(OSK_EVENT, cb);
  return () => window.removeEventListener(OSK_EVENT, cb);
}

type TextField = HTMLInputElement | HTMLTextAreaElement;

export function isTextField(el: EventTarget | null): el is TextField {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    const textLike = ["text", "search", "email", "url", "tel", "number", "password", "decimal"].includes(t) || t === "";
    return textLike && !el.readOnly && !el.disabled;
  }
  return false;
}

function setNativeValue(el: TextField, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function oskInsert(el: TextField, text: string): void {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  setNativeValue(el, el.value.slice(0, start) + text + el.value.slice(end));
  try { el.setSelectionRange(start + text.length, start + text.length); } catch { /* number inputs */ }
}

export function oskBackspace(el: TextField): void {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  if (start !== end) {
    setNativeValue(el, el.value.slice(0, start) + el.value.slice(end));
    try { el.setSelectionRange(start, start); } catch { /* ignore */ }
  } else if (start > 0) {
    setNativeValue(el, el.value.slice(0, start - 1) + el.value.slice(start));
    try { el.setSelectionRange(start - 1, start - 1); } catch { /* ignore */ }
  }
}
