import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import JsBarcode from "jsbarcode";
import { euro, fmtDateTime } from "@/lib/pos/money";
import type { ReceiptSnapshot } from "@/lib/pos/local-db";

export function Barcode128({
  value,
  height = 50,
  width = 1.6,
}: {
  value: string;
  height?: number;
  width?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current)
      JsBarcode(ref.current, value, {
        format: "CODE128",
        displayValue: false,
        height,
        width,
        margin: 0,
      });
  }, [value, height, width]);
  return <svg ref={ref} />;
}

const methodName: Record<string, string> = {
  cash: "Contant",
  pin: "Pin",
  giftcard: "Cadeaubon",
  exchange_credit: "Ruiltegoed",
};
const esc = (value: string) =>
  value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!);

const Row = ({
  l,
  r,
  style,
}: {
  l: React.ReactNode;
  r: React.ReactNode;
  style?: React.CSSProperties;
}) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, ...style }}>
    <span>{l}</span>
    <span style={{ whiteSpace: "nowrap" }}>{r}</span>
  </div>
);

export function ReceiptView({ r, paperWidth = 80 }: { r: ReceiptSnapshot; paperWidth?: number }) {
  const w = paperWidth === 58 ? "58mm" : "80mm";
  return (
    <div
      style={{
        width: w,
        padding: "3mm",
        fontFamily: "Arial, sans-serif",
        fontSize: 12,
        color: "#000",
        background: "#fff",
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", fontWeight: 700 }}>{r.shop.name}</div>
      <div style={{ textAlign: "center" }}>{r.shop.address}</div>
      <div style={{ textAlign: "center" }}>{r.shop.postal_city}</div>
      {r.is_test && (
        <div style={{ textAlign: "center", fontWeight: 700, marginTop: 6 }}>
          *** TESTBON - GEEN VERKOOP ***
        </div>
      )}
      <div style={{ margin: "8px 0" }}>--------------------------------</div>
      <Row l="Datum" r={fmtDateTime(r.created_at)} />
      <Row l="Bon" r={r.receipt_number} />
      <Row l="Medewerker" r={r.employee} />
      <div style={{ margin: "8px 0" }}>--------------------------------</div>
      {r.lines.map((l, i) => (
        <div key={i} style={{ marginBottom: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              {l.qty} x {l.description}
            </span>
            <span>{euro(l.original_cents)}</span>
          </div>
          {l.qty > 1 && <div style={{ paddingLeft: 8 }}>à {euro(l.unit_price_cents)}</div>}
          {l.gift_card_code && <div style={{ paddingLeft: 8 }}>Code {l.gift_card_code}</div>}
          {l.discount_cents > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 8 }}>
              <span>{l.note ?? "Korting"}</span>
              <span>-{euro(l.discount_cents)}</span>
            </div>
          )}
          {l.discount_cents === 0 && l.note && <div style={{ paddingLeft: 8 }}>{l.note}</div>}
        </div>
      ))}
      <div style={{ margin: "8px 0" }}>--------------------------------</div>
      {r.discount_cents > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Totale korting</span>
          <span>-{euro(r.discount_cents)}</span>
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontWeight: 700,
          fontSize: "1.35em",
          borderTop: "2px solid #000",
          borderBottom: "2px solid #000",
          padding: "4px 0",
        }}
      >
        <span>TOTAAL incl. btw</span>
        <span>{euro(r.total_cents)}</span>
      </div>
      <div style={{ marginTop: 4 }}>
        {r.vat.map((v) => (
          <div key={v.rate} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              Btw {v.rate}% over {euro(v.base_cents)}
            </span>
            <span>{euro(v.vat_cents)}</span>
          </div>
        ))}
        {r.giftcard_note && <div>{r.giftcard_note}</div>}
      </div>
      <div style={{ margin: "8px 0" }}>--------------------------------</div>
      {r.payments.map((p, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{methodName[p.method] ?? p.method}</span>
            <span>{euro(p.amount_cents)}</span>
          </div>
          {p.method === "cash" && p.tendered_cents != null && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 8 }}>
                <span>Ontvangen</span>
                <span>{euro(p.tendered_cents)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 8 }}>
                <span>Wisselgeld</span>
                <span>{euro(p.change_cents ?? 0)}</span>
              </div>
            </>
          )}
        </div>
      ))}
      <div style={{ margin: "8px 0" }}>--------------------------------</div>
      <div style={{ textAlign: "center", fontSize: "0.9em" }}>{r.shop.return_text}</div>
      <div style={{ textAlign: "center", marginTop: 8 }}>{r.shop.thank_you}</div>
    </div>
  );
}

function receiptText(r: ReceiptSnapshot): string {
  const lines = [
    r.shop.name,
    r.shop.address,
    r.shop.postal_city,
    "--------------------------------",
    `Datum: ${fmtDateTime(r.created_at)}`,
    `Bon: ${r.receipt_number}`,
    `Medewerker: ${r.employee}`,
    "--------------------------------",
  ];
  if (r.is_test) lines.push("TESTBON - GEEN VERKOOP");
  for (const line of r.lines) {
    lines.push(`${line.qty} x ${line.description}  ${euro(line.final_cents)}`);
    if (line.gift_card_code) lines.push(`  Code: ${line.gift_card_code}`);
    if (line.discount_cents > 0)
      lines.push(`  ${line.note ?? "Korting"}: -${euro(line.discount_cents)}`);
  }
  lines.push("--------------------------------");
  if (r.discount_cents > 0) lines.push(`Totale korting: -${euro(r.discount_cents)}`);
  lines.push(`TOTAAL INCL. BTW: ${euro(r.total_cents)}`);
  for (const payment of r.payments)
    lines.push(`${methodName[payment.method] ?? payment.method}: ${euro(payment.amount_cents)}`);
  lines.push("--------------------------------", r.shop.return_text, r.shop.thank_you);
  return lines.join("\n");
}

async function printPlainReceipt(
  text: string,
  paperWidth: number,
  copies: number,
): Promise<boolean> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  document.body.appendChild(iframe);
  const documentForPrint = iframe.contentDocument;
  if (!documentForPrint) return false;
  const width = paperWidth === 58 ? 58 : 80;
  documentForPrint.open();
  documentForPrint.write(
    `<!doctype html><html><head><style>@page{size:${width}mm auto;margin:0}body{margin:0;padding:3mm;font-family:Arial,sans-serif;font-size:10pt;color:#000}pre{margin:0;white-space:pre-wrap;word-break:break-word}.copy{break-after:page}</style></head><body>${Array.from({ length: Math.max(1, copies) }, () => `<pre class="copy">${esc(text)}</pre>`).join("")}</body></html>`,
  );
  documentForPrint.close();
  await new Promise((resolve) => setTimeout(resolve, 200));
  try {
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    return true;
  } catch {
    return false;
  } finally {
    setTimeout(() => iframe.remove(), 2000);
  }
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
    root.render(
      <div>
        {Array.from({ length: copies }).map((_, i) => (
          <div key={i} style={{ pageBreakAfter: "always" }}>
            {node}
          </div>
        ))}
      </div>,
    );
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
  return printPlainReceipt(receiptText(r), paperWidth, copies);
}
