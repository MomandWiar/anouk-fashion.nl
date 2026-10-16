import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePos } from "@/lib/pos/store";
import { amsDay, amsStartOfDay, euro } from "@/lib/pos/money";
import { buildReport, type Report, type RLine, type RPayment, type RReturn, type RReturnLine, type RSale } from "@/lib/pos/reports";
import { queueAll } from "@/lib/pos/local-db";
import { downloadText, toCsv } from "@/lib/pos/csv";
import { printNode } from "@/components/pos/Receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/_pos/rapportages")({
  head: () => ({ meta: [{ title: "Rapportages · Anouk Fashion" }, { name: "description", content: "Omzet, btw en verkoopcijfers." }, { property: "og:title", content: "Rapportages · Anouk Fashion" }, { property: "og:description", content: "Omzet en verkoopcijfers." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ReportsPage,
});

type Period = "dag" | "week" | "maand" | "jaar" | "vrij";
const addDays = (day: string, n: number) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function range(period: Period, anchor: string, from: string, to: string): { start: string; end: string; prevStart: string; prevEnd: string; label: string } {
  // start inclusive, end exclusive (yyyy-mm-dd, Amsterdam days)
  if (period === "dag") return { start: anchor, end: addDays(anchor, 1), prevStart: addDays(anchor, -1), prevEnd: anchor, label: anchor };
  if (period === "week") {
    const wd = (new Date(anchor + "T12:00:00Z").getUTCDay() + 6) % 7; // 0 = maandag
    const s = addDays(anchor, -wd);
    return { start: s, end: addDays(s, 7), prevStart: addDays(s, -7), prevEnd: s, label: `week ${s} t/m ${addDays(s, 6)}` };
  }
  if (period === "maand") {
    const s = anchor.slice(0, 7) + "-01";
    const [y, m] = s.split("-").map(Number);
    const e = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const ps = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
    return { start: s, end: e, prevStart: ps, prevEnd: s, label: s.slice(0, 7) };
  }
  if (period === "jaar") { const y = Number(anchor.slice(0, 4)); return { start: `${y}-01-01`, end: `${y + 1}-01-01`, prevStart: `${y - 1}-01-01`, prevEnd: `${y}-01-01`, label: String(y) }; }
  const len = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
  return { start: from, end: addDays(to, 1), prevStart: addDays(from, -len), prevEnd: from, label: `${from} t/m ${to}` };
}

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await build(i, i + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function loadReport(start: string, end: string, catName: (id: string | null) => string): Promise<Report> {
  const s = amsStartOfDay(start).toISOString(), e = amsStartOfDay(end).toISOString();
  const sales = await fetchAll<RSale & { sale_lines: RLine[]; payments: RPayment[] }>((a, b) =>
    supabase.from("sales").select("id, created_at, total_cents, goods_cents, giftcard_issue_cents, discount_cents, is_test, exchange_return_id, sale_lines(*), payments(sale_id, method, amount_cents)").gte("created_at", s).lt("created_at", e).range(a, b) as never);
  const rets = await fetchAll<RReturn & { return_lines: RReturnLine[] }>((a, b) =>
    supabase.from("returns").select("id, created_at, refund_total_cents, refund_paid_cents, refund_method, is_test, return_lines(*)").gte("created_at", s).lt("created_at", e).range(a, b) as never);
  // include unsynced local sales, recognisable and never double (queue items are removed after sync)
  const known = new Set(sales.map((x) => x.id));
  const local = (await queueAll()).map((q) => q.payload as Record<string, unknown>).filter((p) => !known.has(p.id as string) && (p.created_at as string) >= s && (p.created_at as string) < e);
  const allSales: RSale[] = sales.map((x) => ({ ...x }));
  const lines: RLine[] = sales.flatMap((x) => x.sale_lines);
  const pays: RPayment[] = sales.flatMap((x) => x.payments);
  for (const p of local) {
    const ls = (p.lines as (RLine & { kind: string })[]).map((l) => ({ ...l, sale_id: p.id as string }));
    const goods = ls.filter((l) => l.kind !== "giftcard").reduce((a, l) => a + l.final_cents, 0);
    allSales.push({ id: p.id as string, created_at: p.created_at as string, total_cents: goods, goods_cents: goods, giftcard_issue_cents: 0, discount_cents: 0, is_test: !!p.is_test, local: true });
    lines.push(...ls);
    pays.push(...(p.payments as RPayment[]).map((x) => ({ ...x, sale_id: p.id as string })));
  }
  return buildReport(allSales, lines, pays, rets, rets.flatMap((r) => r.return_lines), catName);
}

const WD = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const MN: Record<string, string> = { cash: "Contant", pin: "Pin", giftcard: "Cadeaubon", exchange_credit: "Ruiltegoed (ruil)" };

function ReportsPage() {
  const pos = usePos();
  const [period, setPeriod] = useState<Period>("dag");
  const [anchor, setAnchor] = useState(amsDay());
  const [from, setFrom] = useState(amsDay());
  const [to, setTo] = useState(amsDay());
  const [rep, setRep] = useState<Report | null>(null);
  const [prev, setPrev] = useState<Report | null>(null);
  const [lowStock, setLowStock] = useState<{ name: string; qty: number }[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const r = useMemo(() => range(period, anchor, from, to), [period, anchor, from, to]);
  const catName = useMemo(() => { const m = new Map(pos.categories.map((c) => [c.id, c.name])); return (id: string | null) => (id ? m.get(id) ?? "Onbekend" : "Zonder categorie"); }, [pos.categories]);
  // Week- and month reports show no separate returns section (refunds are netted into revenue)
  const hideReturns = period === "week" || period === "maand";

  useEffect(() => {
    if (!pos.online) { toast.error("Rapportages vereisen een internetverbinding"); return; }
    Promise.all([loadReport(r.start, r.end, catName), loadReport(r.prevStart, r.prevEnd, catName)])
      .then(([a, b]) => { setRep(a); setPrev(b); })
      .catch((e) => toast.error((e as Error).message));
    setLowStock([
      ...pos.products.filter((p) => p.active && p.track_stock && (p.stock_qty < 0 || (p.min_stock != null && p.stock_qty <= p.min_stock))).map((p) => ({ name: `${p.name} ${[p.size, p.color].filter(Boolean).join(" ")}`, qty: p.stock_qty })),
      ...pos.categories.filter((c) => c.track_stock && (c.stock_qty < 0 || (c.min_stock != null && c.stock_qty <= c.min_stock))).map((c) => ({ name: `Categorie ${c.name}`, qty: c.stock_qty })),
    ]);
  }, [r, catName, pos.online, pos.products, pos.categories]);

  const pct = (a: number, b: number) => (b === 0 ? "—" : `${a >= b ? "+" : ""}${(((a - b) / Math.abs(b)) * 100).toFixed(1)}%`);

  function exportCsv() {
    if (!rep) return;
    const rows: (string | number)[][] = [["Anouk Fashion rapport", r.label], [], ["Kengetal", "Waarde", "Vorige periode"],
      ["Omzet incl. btw", euro(rep.revenue_cents), euro(prev?.revenue_cents)], ["Btw 21%", euro(rep.vat_cents), euro(prev?.vat_cents)],
      ["Omzet excl. btw", euro(rep.revenue_ex_vat_cents), euro(prev?.revenue_ex_vat_cents)], ["Aantal aankopen", rep.sales_count, prev?.sales_count ?? ""],
      ["Gemiddelde bon", euro(rep.avg_receipt_cents), euro(prev?.avg_receipt_cents)], ["Kortingen", euro(rep.discount_cents), euro(prev?.discount_cents)],
      ["Prijswijzigingen (regels)", rep.price_changes, prev?.price_changes ?? ""], ["Brutowinst (bekende inkoop)", euro(rep.gross_profit_cents), euro(prev?.gross_profit_cents)],
      ["Regels zonder inkoopprijs", rep.profit_lines_missing_cost, ""], ["Cadeaubonnen uitgegeven", euro(rep.giftcards_issued_cents), ""],
      [], ["Betaalwijze", "Bedrag"], ...Object.entries(rep.byMethod).map(([k, v]) => [MN[k] ?? k, euro(v)]),
      [], ["Categorie", "Omzet"], ...Object.entries(rep.byCategory).map(([k, v]) => [k, euro(v)]),
      [], ["Artikel", "Aantal", "Omzet"], ...rep.topItems.map((t) => [t.name, t.qty, euro(t.cents)])];
    downloadText(`rapport-${r.label.replace(/\s/g, "_")}.csv`, toCsv(rows));
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Rapportages</h1>
        {(["dag", "week", "maand", "jaar", "vrij"] as Period[]).map((p) => <Button key={p} variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>{p === "vrij" ? "Vrij bereik" : p[0].toUpperCase() + p.slice(1)}</Button>)}
        {period !== "vrij" ? <div><Label>Datum</Label><Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} /></div>
          : <><div><Label>Van</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div><Label>Tot en met</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></>}
        <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />CSV/Excel</Button>
        <Button variant="outline" onClick={() => ref.current && printNode(<div style={{ width: "190mm", padding: "10mm", color: "#000" }} dangerouslySetInnerHTML={{ __html: ref.current.innerHTML }} />)}><FileText className="mr-2 h-4 w-4" />PDF</Button>
      </div>
      {rep && (
        <div ref={ref} className="space-y-4">
          <p className="text-muted-foreground">Periode: {r.label} · tijden in Europe/Amsterdam{rep.includes_unsynced > 0 && ` · inclusief ${rep.includes_unsynced} nog niet gesynchroniseerde verkopen`}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Omzet incl. btw", euro(rep.revenue_cents), pct(rep.revenue_cents, prev?.revenue_cents ?? 0)], ["Omzet excl. btw", euro(rep.revenue_ex_vat_cents), ""], ["Aankopen", String(rep.sales_count), pct(rep.sales_count, prev?.sales_count ?? 0)], ["Gemiddelde bon", euro(rep.avg_receipt_cents), pct(rep.avg_receipt_cents, prev?.avg_receipt_cents ?? 0)],
              ["Btw 21%", euro(rep.vat_cents), ""], ["Kortingen", euro(rep.discount_cents), `${rep.price_changes} prijswijzigingen`], ["Brutowinst*", euro(rep.gross_profit_cents), rep.profit_lines_missing_cost ? `${rep.profit_lines_missing_cost} regels zonder inkoopprijs` : ""], ["Cadeaubonnen uitgegeven", euro(rep.giftcards_issued_cents), "geen omzet"]].map(([l, v, sub]) => (
              <div key={l} className="rounded-2xl border bg-card p-4"><div className="text-sm text-muted-foreground">{l}</div><div className="font-display text-2xl font-bold tabular">{v}</div>{sub && <div className="text-xs text-muted-foreground">{sub}{l === "Omzet incl. btw" && " t.o.v. vorige periode"}</div>}</div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Omzet = verkochte kleding min terugbetalingen (op datum van terugbetaling). Cadeaubonuitgifte telt niet als omzet; besteding met een cadeaubon wel. *Brutowinst excl. btw met historische inkoopprijzen; regels zonder inkoopprijs tellen niet mee.</p>
          <div className="grid gap-4 lg:grid-cols-3">
            <Table title="Per betaalwijze" rows={Object.entries(rep.byMethod).map(([k, v]) => [MN[k] ?? k, euro(v)])} />
            <Table title="Per categorie" rows={Object.entries(rep.byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, euro(v)])} />
            <Table title="Best verkocht" rows={rep.topItems.map((t) => [t.name, `${t.qty}× · ${euro(t.cents)}`])} />
            <Table title="Maten" rows={rep.topSizes.map((t) => [t.name, `${t.qty}×`])} />
            <Table title="Kleuren" rows={rep.topColors.map((t) => [t.name, `${t.qty}×`])} />
            <Table title="Per weekdag" rows={rep.byWeekday.map((v, i) => [WD[i], euro(v)])} />
            <Table title="Per uur" rows={rep.byHour.map((v, h) => [`${h}:00`, euro(v)] as [string, string]).filter((_, h) => rep.byHour[h] !== 0)} />
            <Table title="Lage voorraad" rows={lowStock.map((l) => [l.name, String(l.qty)])} />
            {!hideReturns && <Table title="Terugbetalingen (dag/jaar/vrij)" rows={[["Zie intern retouroverzicht", ""]]} />}
          </div>
        </div>
      )}
    </div>
  );
}

function Table({ title, rows }: { title: string; rows: [string, string][] | string[][] }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="mb-2 font-semibold">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Geen gegevens</p> : (
        <table className="w-full text-sm"><tbody>{rows.map((r, i) => <tr key={i} className="border-t"><td className="py-1">{r[0]}</td><td className="text-right tabular">{r[1]}</td></tr>)}</tbody></table>
      )}
    </div>
  );
}
