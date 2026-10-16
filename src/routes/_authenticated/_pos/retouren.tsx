import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePos } from "@/lib/pos/store";
import { amsDay, euro, fmtDateTime, parseEuro } from "@/lib/pos/money";
import { priceCart, refundForLine, type CartLine } from "@/lib/pos/pricing";
import { buildPayload, buildSnapshot, serverMaxSeqToday, uuid, type PendingPayment } from "@/lib/pos/checkout";
import { nextReceiptNumber, receiptSave } from "@/lib/pos/local-db";
import { REGISTER_ID } from "@/lib/pos/store";
import { printReceipt } from "@/components/pos/Receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/_pos/retouren")({
  validateSearch: (s: Record<string, unknown>) => ({ bon: typeof s.bon === "string" ? s.bon : undefined }),
  head: () => ({ meta: [{ title: "Ruilen en retouren · Anouk Fashion" }, { name: "description", content: "Ruilingen en interne retouren verwerken." }, { property: "og:title", content: "Ruilen en retouren · Anouk Fashion" }, { property: "og:description", content: "Ruilingen en retouren." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ReturnsPage,
});

type Sale = Tables<"sales"> & { sale_lines: Tables<"sale_lines">[] };
type ManualLine = { key: string; description: string; category_id: string | null; qty: number; amount: string };

function ReturnsPage() {
  const { bon } = Route.useSearch();
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Ruilen en retouren</h1>
      <Tabs defaultValue="verwerken">
        <TabsList><TabsTrigger value="verwerken">Verwerken</TabsTrigger><TabsTrigger value="overzicht">Intern overzicht retouren</TabsTrigger></TabsList>
        <TabsContent value="verwerken"><ProcessReturn initialBon={bon} /></TabsContent>
        <TabsContent value="overzicht"><ReturnsOverview /></TabsContent>
      </Tabs>
    </div>
  );
}

function ProcessReturn({ initialBon }: { initialBon?: string }) {
  const pos = usePos();
  const [noReceipt, setNoReceipt] = useState(false);
  const [bon, setBon] = useState(initialBon ?? "");
  const [sale, setSale] = useState<Sale | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [manual, setManual] = useState<ManualLine[]>([]);
  const [reason, setReason] = useState("");
  const [exceptionNote, setExceptionNote] = useState("");
  const [refundMethod, setRefundMethod] = useState<"cash" | "pin">("cash");
  const [payMethod, setPayMethod] = useState<"cash" | "pin">("cash");
  const [newLines, setNewLines] = useState<CartLine[]>([]);
  const [scan, setScan] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnId, setReturnId] = useState(uuid);
  const days = pos.settings?.exchange_days ?? 8;

  async function load(n = bon) {
    if (!n.trim()) return;
    const { data, error } = await supabase.from("sales").select("*, sale_lines(*)").eq("receipt_number", n.trim()).maybeSingle();
    if (error) return toast.error(pos.online ? error.message : "Retouren vereisen een internetverbinding");
    if (!data) return toast.error("Bon niet gevonden");
    setSale(data as Sale); setQty({}); setRestock({});
  }
  useEffect(() => { if (initialBon) void load(initialBon); }, [initialBon]); // eslint-disable-line react-hooks/exhaustive-deps

  const outside = sale ? Date.now() - new Date(sale.created_at).getTime() > days * 86400000 : false;

  const refundTotal = useMemo(() => {
    if (noReceipt) return manual.reduce((a, l) => a + (parseEuro(l.amount) ?? 0), 0);
    if (!sale) return 0;
    return sale.sale_lines.reduce((a, l) => {
      const q = qty[l.id] ?? 0;
      return q > 0 ? a + refundForLine(l.final_cents, l.qty, l.returned_qty, l.refunded_cents, q) : a;
    }, 0);
  }, [noReceipt, manual, sale, qty]);

  const newTotals = useMemo(() => priceCart(newLines, pos.promotions, null, amsDay()), [newLines, pos.promotions]);
  const diff = newTotals.total_cents - refundTotal; // >0 customer pays, <0 shop refunds

  function addNew(code: string) {
    const p = pos.products.find((x) => x.barcode === code.trim() || x.name.toLowerCase() === code.trim().toLowerCase());
    if (!p) return toast.error("Product niet gevonden");
    const cat = pos.categories.find((c) => c.id === p.category_id);
    setNewLines((ls) => [...ls, { key: uuid(), kind: "product", product_id: p.id, category_id: p.category_id, description: p.name, size: p.size, color: p.color, qty: 1, unit_price_cents: p.price_cents, list_price_cents: p.price_cents, stock_mode: p.track_stock ? "detailed" : cat?.track_stock ? "category" : "none", cost_cents: p.cost_cents }]);
    setScan("");
  }

  async function submit() {
    if (!pos.online) return toast.error("Verbinding nodig voor retouren (bescherming tegen dubbele verwerking).");
    if (!pos.employee || !pos.session) return toast.error("Kies een medewerker en open de kassa.");
    if (!reason.trim()) return toast.error("Reden is verplicht");
    const lines = noReceipt
      ? manual.filter((l) => l.qty > 0).map((l) => ({ description: l.description || "Retour zonder bon", category_id: l.category_id, qty: l.qty, amount_cents: parseEuro(l.amount) ?? -1, restock: false }))
      : (sale?.sale_lines ?? []).filter((l) => (qty[l.id] ?? 0) > 0).map((l) => ({ sale_line_id: l.id, qty: qty[l.id], restock: restock[l.id] ?? true }));
    if (lines.length === 0) return toast.error("Selecteer artikelen");
    if (outside && !exceptionNote.trim()) return toast.error(`Buiten ${days} dagen: leg een gemotiveerde uitzondering vast.`);
    setBusy(true);
    try {
      let exchange_sale: Record<string, unknown> | undefined;
      let snapshot;
      if (newLines.length > 0) {
        const credit = Math.min(refundTotal, newTotals.total_cents);
        const payments: PendingPayment[] = [];
        if (credit > 0) payments.push({ id: uuid(), method: "exchange_credit", amount_cents: credit });
        if (diff > 0) payments.push({ id: uuid(), method: payMethod, amount_cents: diff, tendered_cents: payMethod === "cash" ? diff : undefined, change_cents: payMethod === "cash" ? 0 : undefined, manual: true });
        const rn = await nextReceiptNumber(REGISTER_ID, amsDay(), await serverMaxSeqToday());
        const created_at = new Date().toISOString();
        const sale_id = uuid();
        snapshot = buildSnapshot({ settings: pos.settings, receipt_number: rn, created_at, employee: pos.employee, totals: newTotals, payments, is_test: !!pos.settings?.test_mode });
        exchange_sale = buildPayload({ sale_id, receipt_number: rn, created_at, session_id: pos.session.id, employee: pos.employee, totals: newTotals, payments, is_test: !!pos.settings?.test_mode, offline: false, snapshot });
        await receiptSave({ receipt_number: rn, sale_id, created_at, snapshot, synced: true });
      }
      const { data, error } = await supabase.rpc("process_return", { p: {
        id: returnId, original_sale_id: noReceipt ? null : sale?.id, kind: newLines.length ? "ruil" : "retour", no_receipt: noReceipt,
        reason, exception_note: exceptionNote || null, employee_id: pos.employee.id, cash_session_id: pos.session.id,
        refund_method: refundMethod, lines, exchange_sale, is_test: !!pos.settings?.test_mode,
      } as never });
      if (error) throw error;
      const r = data as { refund_paid: number; duplicate?: boolean };
      if (r.duplicate) toast.message("Deze retour was al verwerkt.");
      else toast.success(r.refund_paid > 0 ? `Verwerkt. Terug te betalen (${refundMethod === "cash" ? "contant" : "pin, handmatig"}): ${euro(r.refund_paid)}` : diff > 0 ? `Ruil verwerkt, bijbetaald ${euro(diff)}` : "Ruil verwerkt");
      if (snapshot) void printReceipt(snapshot, pos.settings?.paper_width ?? 80);
      setSale(null); setBon(""); setQty({}); setManual([]); setReason(""); setExceptionNote(""); setNewLines([]); setReturnId(uuid());
      void pos.reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border bg-card p-4">
        <div className="flex gap-2">
          <Button variant={!noReceipt ? "default" : "outline"} onClick={() => setNoReceipt(false)}>Met bon</Button>
          <Button variant={noReceipt ? "default" : "outline"} onClick={() => { setNoReceipt(true); setSale(null); }}>Zonder bon</Button>
        </div>
        {!noReceipt ? (
          <>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void load(); }}>
              <Input data-scan="1" value={bon} onChange={(e) => setBon(e.target.value.replace(/\D/g, ""))} placeholder="Scan of typ bonnummer" className="h-12 font-mono" />
              <Button className="h-12">Ophalen</Button>
            </form>
            {sale && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Verkoop {fmtDateTime(sale.created_at)}</p>
                {outside && <p className="rounded-lg bg-warning p-2 text-sm text-warning-foreground">Let op: deze aankoop is ouder dan {days} dagen.</p>}
                {sale.sale_lines.filter((l) => l.kind !== "giftcard").sort((a, b) => a.line_no - b.line_no).map((l) => {
                  const avail = l.qty - l.returned_qty;
                  return (
                    <div key={l.id} className="rounded-xl border p-3">
                      <div className="flex justify-between"><span className="font-medium">{l.description} {[l.size, l.color].filter(Boolean).join(" ")}</span><span className="tabular">{euro(l.final_cents)} voor {l.qty}</span></div>
                      <div className="text-xs text-muted-foreground">Nog beschikbaar: {avail}{l.discount_note ? ` · ${l.discount_note}` : ""}</div>
                      {avail > 0 && (
                        <div className="mt-2 flex items-center gap-3">
                          <Label>Aantal</Label>
                          <Input type="number" min={0} max={avail} value={qty[l.id] ?? 0} onChange={(e) => setQty({ ...qty, [l.id]: Math.min(avail, Math.max(0, parseInt(e.target.value) || 0)) })} className="h-10 w-20" />
                          <label className="flex items-center gap-2 text-sm"><Checkbox checked={restock[l.id] ?? true} onCheckedChange={(v) => setRestock({ ...restock, [l.id]: !!v })} />Weer verkoopbaar</label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Wordt intern gemarkeerd als retour zonder bon.</p>
            {manual.map((l, i) => (
              <div key={l.key} className="grid grid-cols-[1fr_120px_70px_100px_40px] gap-2">
                <Input value={l.description} placeholder="Omschrijving" onChange={(e) => setManual(manual.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                <select className="rounded-md border bg-background px-2" value={l.category_id ?? ""} onChange={(e) => setManual(manual.map((x, j) => j === i ? { ...x, category_id: e.target.value || null } : x))}>
                  <option value="">Categorie</option>{pos.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Input type="number" min={1} value={l.qty} onChange={(e) => setManual(manual.map((x, j) => j === i ? { ...x, qty: Math.max(1, parseInt(e.target.value) || 1) } : x))} />
                <Input value={l.amount} placeholder="Bedrag" onChange={(e) => setManual(manual.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                <Button size="icon" variant="ghost" onClick={() => setManual(manual.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" onClick={() => setManual([...manual, { key: uuid(), description: "", category_id: null, qty: 1, amount: "" }])}><Plus className="mr-2 h-4 w-4" />Regel</Button>
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">Ruilen: nieuwe artikelen (optioneel)</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addNew(scan); }}>
          <Input data-scan="1" value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan barcode of exacte productnaam" className="h-11" />
          <Button className="h-11">Toevoegen</Button>
        </form>
        {newTotals.lines.map((l) => (
          <div key={l.key} className="flex items-center justify-between rounded-lg border p-2 text-sm">
            <span>{l.qty} × {l.description} {[l.size, l.color].filter(Boolean).join(" ")}</span>
            <span className="flex items-center gap-2 tabular">{euro(l.final_cents)}<Button size="icon" variant="ghost" onClick={() => setNewLines(newLines.filter((x) => x.key !== l.key))}><Trash2 className="h-4 w-4" /></Button></span>
          </div>
        ))}
        <div className="space-y-1 rounded-xl bg-muted p-3">
          <div className="flex justify-between"><span>Retourwaarde</span><span className="tabular">{euro(refundTotal)}</span></div>
          {newLines.length > 0 && <div className="flex justify-between"><span>Nieuwe artikelen</span><span className="tabular">{euro(newTotals.total_cents)}</span></div>}
          <div className="flex justify-between text-lg font-bold">
            <span>{newLines.length === 0 ? "Terug te betalen" : diff > 0 ? "Klant betaalt bij" : diff < 0 ? "Terug te geven" : "Gelijke waarde"}</span>
            <span className="tabular">{euro(Math.abs(newLines.length ? diff : refundTotal))}</span>
          </div>
        </div>
        {(newLines.length === 0 || diff < 0) && refundTotal > 0 && (
          <div className="flex items-center gap-2"><Label>Terugbetalen via</Label>
            <Button size="sm" variant={refundMethod === "cash" ? "default" : "outline"} onClick={() => setRefundMethod("cash")}>Contant</Button>
            <Button size="sm" variant={refundMethod === "pin" ? "default" : "outline"} onClick={() => setRefundMethod("pin")}>Pin (handmatig bevestigd)</Button>
          </div>
        )}
        {newLines.length > 0 && diff > 0 && (
          <div className="flex items-center gap-2"><Label>Bijbetaling via</Label>
            <Button size="sm" variant={payMethod === "cash" ? "default" : "outline"} onClick={() => setPayMethod("cash")}>Contant (gepast)</Button>
            <Button size="sm" variant={payMethod === "pin" ? "default" : "outline"} onClick={() => setPayMethod("pin")}>Pin (handmatig bevestigd)</Button>
          </div>
        )}
        <div className="space-y-1"><Label>Reden (verplicht)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="bijv. verkeerde maat" /></div>
        {(outside || noReceipt) && <div className="space-y-1"><Label>Gemotiveerde uitzondering{outside ? " (verplicht)" : ""}</Label><Textarea value={exceptionNote} onChange={(e) => setExceptionNote(e.target.value)} /></div>}
        <Button className="h-14 w-full text-lg" disabled={busy || (refundTotal === 0 && newLines.length === 0)} onClick={submit}>
          {newLines.length ? "Ruil afronden" : "Retour verwerken"}
        </Button>
      </div>
    </div>
  );
}

function ReturnsOverview() {
  const pos = usePos();
  const [rows, setRows] = useState<(Tables<"returns"> & { return_lines: Tables<"return_lines">[] })[]>([]);
  useEffect(() => {
    supabase.from("returns").select("*, return_lines(*)").order("created_at", { ascending: false }).limit(300).then(({ data }) => setRows((data ?? []) as never));
  }, []);
  const total = rows.filter((r) => !r.is_test).reduce((a, r) => a + r.refund_total_cents, 0);
  const qtyTotal = rows.filter((r) => !r.is_test).reduce((a, r) => a + r.return_lines.reduce((b, l) => b + l.qty, 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex gap-6 rounded-xl border bg-card p-4"><div>Aantal artikelen: <b>{qtyTotal}</b></div><div>Totaal retourwaarde: <b>{euro(total)}</b></div></div>
      <div className="overflow-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr><th className="p-2">Datum</th><th>Soort</th><th>Artikelen</th><th>Reden</th><th>Medewerker</th><th className="text-right">Waarde</th><th className="p-2 text-right">Uitbetaald</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="p-2">{fmtDateTime(r.created_at)}</td>
                <td>{r.kind}{r.no_receipt && " · zonder bon"}{r.outside_window && " · buiten termijn"}{r.is_test && " · TEST"}</td>
                <td>{r.return_lines.map((l) => `${l.qty}× ${l.description}${l.restock ? "" : " (beschadigd)"}`).join(", ")}</td>
                <td>{r.reason}{r.exception_note && <div className="text-xs text-muted-foreground">{r.exception_note}</div>}</td>
                <td>{pos.employees.find((e) => e.id === r.employee_id)?.name}</td>
                <td className="text-right tabular">{euro(r.refund_total_cents)}</td>
                <td className="p-2 text-right tabular">{r.refund_paid_cents > 0 ? `${euro(r.refund_paid_cents)} ${r.refund_method === "cash" ? "contant" : "pin"}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
