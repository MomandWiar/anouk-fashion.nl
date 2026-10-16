import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import JsBarcode from "jsbarcode";
import { euro, fmtDateTime } from "@/lib/pos/money";
import type { ReceiptSnapshot } from "@/lib/pos/local-db";

export function Barcode128({ value, height = 50, width = 1.6 }: { value: string; height?: number; width?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) JsBarcode(ref.current, value, { format: "CODE128", displayValue: false, height, width, margin: 0 });
  }, [value, height, width]);
  return <svg ref={ref} />;
}

const methodName: Record<string, string> = { cash: "Contant", pin: "Pin", giftcard: "Cadeaubon", exchange_credit: "Ruiltegoed" };

/** Print-friendly (pure black) version of the Anouk Fashion logo. */
export function ReceiptLogo({ small }: { small?: boolean }) {
  return (
    <div style={{ textAlign: "center", lineHeight: 1, margin: "2px 0 8px" }}>
      <div style={{ fontFamily: "'Dancing Script', 'Brush Script MT', cursive", fontSize: small ? 30 : 38, fontWeight: 500 }}>
        Anouk<span style={{ fontSize: "0.5em", verticalAlign: "0.15em", marginLeft: 2 }}>♥</span>
      </div>
      <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: small ? 9 : 11, letterSpacing: "0.45em", marginTop: 4, paddingLeft: "0.45em" }}>FASHION</div>
    </div>
  );
}

const Divider = () => <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />;
const Row = ({ l, r, style }: { l: React.ReactNode; r: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, ...style }}><span>{l}</span><span style={{ whiteSpace: "nowrap" }}>{r}</span></div>
);

export function ReceiptView({ r, paperWidth = 80 }: { r: ReceiptSnapshot; paperWidth?: number }) {
  const w = paperWidth === 58 ? "58mm" : "80mm";
  const small = paperWidth === 58;
  return (
    <div style={{ width: w, padding: "4mm", fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: small ? 10 : 12, color: "#000", background: "#fff", boxSizing: "border-box" }}>
      {r.shop.logo ? <img src={r.shop.logo} alt="" style={{ maxWidth: "60%", margin: "0 auto 6px", display: "block" }} /> : <ReceiptLogo small={small} />}
      <div style={{ textAlign: "center" }}>{r.shop.address}</div>
      <div style={{ textAlign: "center" }}>{r.shop.postal_city}</div>
      {r.is_test && <div style={{ textAlign: "center", fontWeight: 700, marginTop: 6 }}>*** TESTBON - GEEN VERKOOP ***</div>}
      <Divider />
      <Row l="Datum" r={fmtDateTime(r.created_at)} />
      <Row l="Bon" r={r.receipt_number} />
      <Row l="Medewerker" r={r.employee} />
      <Divider />
      {r.lines.map((l, i) => (
        <div key={i} style={{ marginBottom: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{l.qty} x {l.description}</span>
            <span>{euro(l.original_cents)}</span>
          </div>
          {l.qty > 1 && <div style={{ paddingLeft: 8 }}>à {euro(l.unit_price_cents)}</div>}
          {l.gift_card_code && <div style={{ paddingLeft: 8 }}>Code {l.gift_card_code}</div>}
          {l.discount_cents > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 8 }}>
              <span>{l.note ?? "Korting"}</span><span>-{euro(l.discount_cents)}</span>
            </div>
          )}
          {l.discount_cents === 0 && l.note && <div style={{ paddingLeft: 8 }}>{l.note}</div>}
        </div>
      ))}
      <Divider />
      {r.discount_cents > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>Totale korting</span><span>-{euro(r.discount_cents)}</span></div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "1.35em", borderTop: "2px solid #000", borderBottom: "2px solid #000", padding: "4px 0" }}>
        <span>TOTAAL incl. btw</span><span>{euro(r.total_cents)}</span>
      </div>
      <div style={{ marginTop: 4 }}>
        {r.vat.map((v) => (
          <div key={v.rate} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Btw {v.rate}% over {euro(v.base_cents)}</span><span>{euro(v.vat_cents)}</span>
          </div>
        ))}
        {r.giftcard_note && <div>{r.giftcard_note}</div>}
      </div>
      <Divider />
      {r.payments.map((p, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>{methodName[p.method] ?? p.method}</span><span>{euro(p.amount_cents)}</span></div>
          {p.method === "cash" && p.tendered_cents != null && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 8 }}><span>Ontvangen</span><span>{euro(p.tendered_cents)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 8 }}><span>Wisselgeld</span><span>{euro(p.change_cents ?? 0)}</span></div>
            </>
          )}
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
        <Barcode128 value={r.receipt_number} height={paperWidth === 58 ? 40 : 50} width={paperWidth === 58 ? 1.2 : 1.6} />
      </div>
      <div style={{ textAlign: "center", letterSpacing: 2 }}>{r.receipt_number}</div>
      <Divider /><div style={{ textAlign: "center", fontSize: "0.9em" }}>{r.shop.return_text}</div>
      <div style={{ textAlign: "center", marginTop: 8, fontFamily: "'Dancing Script', cursive", fontSize: "1.6em" }}>{r.shop.thank_you}</div>
    </div>
  );
}

/** Prints any receipt-like node via the Windows/browser print dialog. Never throws. */
export async function printNode(node: React.ReactNode, copies = 1): Promise<boolean> {
  try {
    let host = document.getElementById("print-area");
    if (!host) {
      host = document.createElement("div");
      host.id = "print-area";
      document.body.appendChild(host);
    }
    const root = createRoot(host);
    root.render(<div>{Array.from({ length: copies }).map((_, i) => <div key={i} style={{ pageBreakAfter: "always" }}>{node}</div>)}</div>);
    await new Promise((r) => setTimeout(r, 250));
    window.print();
    setTimeout(() => root.unmount(), 500);
    return true;
  } catch (e) {
    console.error("Printfout", e);
    return false;
  }
}

export function printReceipt(r: ReceiptSnapshot, paperWidth = 80, copies = 1) {
  return printNode(<ReceiptView r={r} paperWidth={paperWidth} />, copies);
}
