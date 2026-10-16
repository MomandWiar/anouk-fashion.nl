import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Printer, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePos } from "@/lib/pos/store";
import { amsDay, amsStartOfDay, euro, fmtDateTime, parseEuro } from "@/lib/pos/money";
import { receiptGet, receiptsAll, type ReceiptSnapshot } from "@/lib/pos/local-db";
import { printReceipt, ReceiptView } from "@/components/pos/Receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tables } from "@/integrations/supabase/types";

type Sale = Tables<"sales"> & { sale_lines: Tables<"sale_lines">[]; payments: Tables<"payments">[] };

export const Route = createFileRoute("/_authenticated/_pos/verkopen")({
  validateSearch: (s: Record<string, unknown>) => ({ bon: typeof s.bon === "string" ? s.bon : undefined }),
  head: () => ({ meta: [{ title: "Verkopen en bonnen · Anouk Fashion" }, { name: "description", content: "Bonnen terugvinden en opnieuw printen." }, { property: "og:title", content: "Verkopen · Anouk Fashion" }, { property: "og:description", content: "Bonnen terugvinden." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SalesPage,
});

const methodName: Record<string, string> = { cash: "Contant", pin: "Pin", giftcard: "Cadeaubon", exchange_credit: "Ruiltegoed" };

function SalesPage() {
  const pos = usePos();
  const navigate = useNavigate();
  const { bon } = Route.useSearch();
  const today = amsDay();
  const [q, setQ] = useState(bon ?? "");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [amount, setAmount] = useState("");
  const [emp, setEmp] = useState("");
  const [method, setMethod] = useState("");
  const [rows, setRows] = useState<Sale[]>([]);
  const [sel, setSel] = useState<Sale | null>(null);
  const [localSel, setLocalSel] = useState<ReceiptSnapshot | null>(null);

  async function run(receipt?: string) {
    setSel(null); setLocalSel(null);
    const rn = (receipt ?? q).trim();
    if (!pos.online) {
      if (rn) { const r = await receiptGet(rn); if (r) setLocalSel(r.snapshot); else toast.error("Bon niet lokaal beschikbaar (offline)"); }
      else { const all = await receiptsAll(); toast.message(`${all.length} bonnen lokaal beschikbaar; zoek op bonnummer.`); }
      return;
    }
    let query = supabase.from("sales").select("*, sale_lines(*), payments(*)").order("created_at", { ascending: false }).limit(200);
    if (rn) query = query.eq("receipt_number", rn);
    else {
      const end = new Date(amsStartOfDay(to).getTime() + 86400000);
      query = query.gte("created_at", amsStartOfDay(from).toISOString()).lt("created_at", end.toISOString());
      const c = parseEuro(amount); if (c != null) query = query.eq("total_cents", c);
      if (emp) query = query.eq("employee_id", emp);
    }
    const { data, error } = await query;
    if (error) return toast.error(error.message);
    let list = (data ?? []) as Sale[];
    if (method) list = list.filter((s) => s.payments.some((p) => p.method === method));
    setRows(list);
    if (rn) {
      if (list[0]) setSel(list[0]);
      else { const r = await receiptGet(rn); if (r) setLocalSel(r.snapshot); else toast.error("Bon niet gevonden"); }
    }
  }
  useEffect(() => { void run(bon); }, [bon]); // eslint-disable-line react-hooks/exhaustive-deps

  const empName = (id: string | null) => pos.employees.find((e) => e.id === id)?.name ?? "—";
  const pw = pos.settings?.paper_width ?? 80;

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_440px]">
      <div className="space-y-4 overflow-auto p-4">
        <h1 className="text-2xl font-semibold">Verkopen en bonnen</h1>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(); }}>
          <Input data-scan="1" value={q} onChange={(e) => setQ(e.target.value.replace(/\D/g, ""))} placeholder="Scan of typ bonnummer" className="h-12 font-mono text-lg" />
          <Button className="h-12"><Search className="mr-2 h-4 w-4" />Zoeken</Button>
        </form>
        <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-3 md:grid-cols-5">
          <div><Label>Van</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>Tot en met</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div><Label>Bedrag</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="bijv. 12,00" /></div>
          <div><Label>Medewerker</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2" value={emp} onChange={(e) => setEmp(e.target.value)}>
              <option value="">Alle</option>{pos.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></div>
          <div><Label>Betaalwijze</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">Alle</option>{Object.entries(methodName).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <Button variant="secondary" className="col-span-2 md:col-span-5" onClick={() => { setQ(""); void run(""); }}>Filter toepassen</Button>
        </div>
        <div className="divide-y rounded-xl border bg-card">
          {rows.length === 0 && <p className="p-4 text-muted-foreground">Geen verkopen gevonden.</p>}
          {rows.map((s) => (
            <button key={s.id} onClick={() => { setSel(s); setLocalSel(null); }} className="flex w-full items-center justify-between p-3 text-left hover:bg-muted">
              <div>
                <div className="font-mono">{s.receipt_number}{s.is_test && <span className="ml-2 rounded bg-warning px-1 text-xs">TEST</span>}{s.offline && <span className="ml-2 rounded bg-muted px-1 text-xs">offline</span>}</div>
                <div className="text-sm text-muted-foreground">{fmtDateTime(s.created_at)} · {empName(s.employee_id)} · {s.payments.map((p) => methodName[p.method]).join(" + ")}</div>
              </div>
              <div className="text-lg font-semibold tabular">{euro(s.total_cents)}</div>
            </button>
          ))}
        </div>
      </div>
      <aside className="overflow-auto border-l bg-card p-4">
        {!sel && !localSel && <p className="text-muted-foreground">Selecteer een verkoop.</p>}
        {localSel && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Lokaal opgeslagen bon</p>
            <div className="rounded border"><ReceiptView r={localSel} paperWidth={pw} /></div>
            <Button className="h-12 w-full" onClick={() => printReceipt(localSel, pw)}><Printer className="mr-2 h-4 w-4" />Opnieuw printen</Button>
          </div>
        )}
        {sel && (
          <div className="space-y-4">
            <div>
              <h2 className="font-mono text-xl">{sel.receipt_number}</h2>
              <p className="text-sm text-muted-foreground">{fmtDateTime(sel.created_at)} · {empName(sel.employee_id)}</p>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Artikel</th><th className="text-right">Aant.</th><th className="text-right">Orig.</th><th className="text-right">Betaald</th></tr></thead>
              <tbody>
                {sel.sale_lines.sort((a, b) => a.line_no - b.line_no).map((l) => (
                  <tr key={l.id} className="border-t align-top">
                    <td className="py-1">{l.description} {[l.size, l.color].filter(Boolean).join(" ")}
                      {l.discount_note && <div className="text-xs text-primary">{l.discount_note}</div>}
                      {l.returned_qty > 0 && <div className="text-xs text-destructive">{l.returned_qty} retour/geruild · nog {l.qty - l.returned_qty} beschikbaar</div>}
                    </td>
                    <td className="text-right tabular">{l.qty}</td>
                    <td className="text-right tabular">{euro(l.original_cents)}</td>
                    <td className="text-right tabular">{euro(l.final_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 border-t pt-2 text-sm">
              {sel.discount_cents > 0 && <div className="flex justify-between"><span>Korting</span><span>−{euro(sel.discount_cents)}</span></div>}
              <div className="flex justify-between text-lg font-semibold"><span>Totaal</span><span>{euro(sel.total_cents)}</span></div>
              {sel.payments.map((p) => (
                <div key={p.id} className="flex justify-between"><span>{methodName[p.method]}{p.method === "pin" && p.manual_confirmed ? " (handmatig)" : ""}{p.method === "cash" && p.tendered_cents != null ? ` · ontvangen ${euro(p.tendered_cents)}, wisselgeld ${euro(p.change_cents)}` : ""}</span><span>{euro(p.amount_cents)}</span></div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" onClick={async () => { const ok = await printReceipt(sel.snapshot as unknown as ReceiptSnapshot, pw); if (!ok) toast.error("Printen mislukt"); }}><Printer className="mr-2 h-4 w-4" />Opnieuw printen</Button>
              <Button className="h-12" onClick={() => navigate({ to: "/retouren", search: { bon: sel.receipt_number } })}><RotateCcw className="mr-2 h-4 w-4" />Ruilen / retour</Button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
