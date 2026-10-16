import { useEffect, useRef, useState } from "react";
import { Delete, ArrowBigUp, ChevronDown } from "lucide-react";
import { isTextField, oskBackspace, oskEnabled, oskInsert, onOskSettingChange } from "@/lib/pos/keyboard";
import { cn } from "@/lib/utils";

const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

/**
 * Touch keyboard that appears when a text/number field gets focus.
 * Device-local setting (Instellingen → Schermtoetsenbord); meant for
 * touchscreen registers without a physical keyboard.
 */
export function OnScreenKeyboard() {
  const [enabled, setEnabled] = useState(oskEnabled());
  const [target, setTarget] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [shift, setShift] = useState(false);
  const [hidden, setHidden] = useState(false);
  const targetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  targetRef.current = target;

  useEffect(() => onOskSettingChange(() => setEnabled(oskEnabled())), []);

  useEffect(() => {
    if (!enabled) { setTarget(null); return; }
    const onFocusIn = (e: FocusEvent) => {
      if (isTextField(e.target)) { setTarget(e.target); setHidden(false); }
    };
    const onFocusOut = (e: FocusEvent) => {
      // focus moves to another field or away; keyboard buttons keep focus via preventDefault
      if (e.target === targetRef.current) {
        setTimeout(() => {
          const active = document.activeElement;
          if (!isTextField(active)) setTarget(null);
        }, 0);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [enabled]);

  if (!enabled || !target || hidden) return null;

  const press = (key: string) => {
    const el = targetRef.current;
    if (!el || !document.contains(el)) { setTarget(null); return; }
    if (key === "⌫") oskBackspace(el);
    else oskInsert(el, shift ? key.toUpperCase() : key);
    if (shift) setShift(false);
  };

  const keyBtn = (label: string, value: string, className?: string) => (
    <button
      key={label}
      type="button"
      tabIndex={-1}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => press(value)}
      className={cn(
        "flex h-14 min-w-0 flex-1 items-center justify-center rounded-md border bg-card text-2xl font-medium shadow-sm active:bg-accent",
        className,
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[80] border-t bg-secondary/95 p-2 shadow-lg backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
        {ROWS.slice(0, 2).map((row, i) => (
          <div key={i} className="flex gap-1.5">
            {row.map((k) => keyBtn(shift && i === 1 ? k.toUpperCase() : k, k))}
          </div>
        ))}
        <div className="flex gap-1.5 px-5">
          {ROWS[2].map((k) => keyBtn(shift ? k.toUpperCase() : k, k))}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            tabIndex={-1}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => setShift((s) => !s)}
            className={cn("flex h-14 w-16 items-center justify-center rounded-md border shadow-sm", shift ? "bg-primary text-primary-foreground" : "bg-card")}
            aria-label="Shift"
          >
            <ArrowBigUp className="h-6 w-6" />
          </button>
          {ROWS[3].map((k) => keyBtn(shift ? k.toUpperCase() : k, k))}
          <button
            type="button"
            tabIndex={-1}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => press("⌫")}
            className="flex h-14 w-16 items-center justify-center rounded-md border bg-card shadow-sm active:bg-accent"
            aria-label="Wissen"
          >
            <Delete className="h-6 w-6" />
          </button>
        </div>
        <div className="flex gap-1.5">
          {keyBtn(",", ",", "w-16 flex-none")}
          {keyBtn("spatie", " ", "flex-[4] text-lg")}
          {keyBtn(".", ".", "w-16 flex-none")}
          <button
            type="button"
            tabIndex={-1}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => setHidden(true)}
            className="flex h-14 w-20 flex-none items-center justify-center rounded-md border bg-card shadow-sm active:bg-accent"
            aria-label="Toetsenbord verbergen"
          >
            <ChevronDown className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
