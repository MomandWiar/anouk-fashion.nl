import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePos } from "@/lib/pos/store";
import { euro, fmtDateTime, parseEuro } from "@/lib/pos/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/_pos/dagafsluiting")({
  head: () => ({ meta: [{ title: "Dagafsluiting · Anouk Fashion" }, { name: "description", content: "Kassa tellen en afsluiten." }, { property: "og:title", content: "Dagafsluiting · Anouk Fashion" }, { property: "og:description", content: "Kassa afsluiten." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ClosingPage,
});

const DENOMS = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5];
type Summary = { start: number; cash_sales: number; inleg: number; cash_refunds: number; uitgave: number; kasuitname: number; pin: number; giftcard: number; expected: number };

function ClosingPage() {
  const pos = usePos();
  const [sum, setSum] = useState<Summary | null>(null);
  const [moves, setMoves] = useState<Tables<"cash_movements">[]>([]);
  const [kind, setKind] = useState<"inleg" | "uitgave" | "kasuitname">("uitgave");
  const [amt, setAmt] = useState("");
  const [reason, setReason] = useState("");
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [totalInput, setTotalInput] = useState("");
  const [note, setNote] = useState("");
  const [openAttempts, setOpenAttempts] = useState<Tables<"payment_attempts">[]>([]);
  const [history, setHistory] = useState<Tables<"cash_sessions">[]>([]);
  const s = pos.session;

  const load = useCallback(async () => {
    supabase.from("cash_sessions").select("*").eq("status", "closed").order("closed_at", { ascending: false }).limit(30).then(({ data }) => setHistory(data ?? []));
    supabase.from("payment_attempts").select("*").in("status", ["wachten", "onbekend", "timeout", "geslaagd"]).then(({ data }) => setOpenAttempts(data ?? []));
    if (!s) return;
    const { data, error } = await supabase.rpc("cash_session_expected", { _session_id: s.id });
    if (!error) setSum(data as Summary);
    const m = await supabase.from("cash_movements").select("*").eq("cash_session_id", s.id).order("created_at");
    setMoves(m.data ?? []);
  }, [s]);
  useEffect(() => { void load(); }, [load]);

  const denomTotal = DENOMS.reduce((a, d) => a + d * (parseInt(counts[d] ?? "") || 0), 0);
  const counted = totalInput.trim() ? parseEuro(totalInput) : denomTotal;
  const diff = sum && counted != null ? counted - sum.expected : 0;

  if (!s) return <div className="space-y-4 p-6"><h1 className="text-2xl font-semibold">Dagafsluiting</h1><p className="text-muted-foreground">Er is geen open kassasessie.</p><History rows={history} /></div>;

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-2">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Dagafsluiting</h1>
        <p className="text-sm text-muted-foreground">Sessie geopend {fmtDateTime(s.opened_at)} door {pos.employees.find((e) => e.id === s.opened_by)?.name}</p>
        {pos.pending > 0 && <p className="rounded-xl bg-warning p-3 text-warning-foreground">{pos.pending} offline verkopen nog niet gesynchroniseerd. De afsluiting wordt als voorlopig gemarkeerd.</p>}
        {openAttempts.length > 0 && (
          <div className="space-y-2 rounded-xl bg-destructive/10 p-3">
            <p className="font-semibold text-destructive">Onvoltooide betalingen — los deze eerst op:</p>
            {openAttempts.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span>{fmtDateTime(a.created_at)} · {a.method} {euro(a.amount_cents)} · {a.status}</span>
                <Button size="sm" variant="outline" onClick={async () => {
                  const n = prompt("Toelichting (bijv. 'betaling teruggegeven' of 'niet geslaagd')");
                  if (!n) return;
                  await supabase.from("payment_attempts").update({ status: "teruggeboekt", note: n, updated_at: new Date().toISOString() }).eq("id", a.id);
                  await supabase.from("audit_log").insert({ action: "betaalpoging_opgelost", employee_id: pos.employee?.id, details: { attempt: a.id, note: n } });
                  void load();
                }}>Oplossen</Button>
              </div>
            ))}
          </div>
        )}
        {sum && (
          <div className="space-y-1 rounded-2xl border bg-card p-4">
            {[["Startgeld", sum.start], ["Contante verkopen (ontvangen − wisselgeld)", sum.cash_sales], ["Overige kasinleg", sum.inleg], ["Contante terugbetalingen", -sum.cash_refunds], ["Uitgaven", -sum.uitgave], ["Kasuitname (kluis/bank)", -sum.kasuitname]].map(([l, v]) => (
              <div key={l as string} className="flex justify-between"><span>{l}</span><span className="tabular">{euro(v as number)}</span></div>
            ))}
            <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Verwacht eindgeld</span><span className="tabular">{euro(sum.expected)}</span></div>
            <div className="flex justify-between text-sm text-muted-foreground"><span>Pin (niet in kas)</span><span>{euro(sum.pin)}</span></div>
            <div className="flex justify-between text-sm text-muted-foreground"><span>Cadeaubon (niet in kas)</span><span>{euro(sum.giftcard)}</span></div>
          </div>
        )}
        <div className="space-y-2 rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">Kasmutatie</h2>
          <div className="flex gap-2">{(["uitgave", "kasuitname", "inleg"] as const).map((k) => <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{k === "uitgave" ? "Uitgave" : k === "kasuitname" ? "Naar kluis/bank" : "Inleg"}</Button>)}</div>
          <div className="flex gap-2"><Input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Bedrag" className="w-32" /><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reden (verplicht)" />
            <Button onClick={async () => {
              const c = parseEuro(amt); if (!c || c <= 0 || !reason.trim()) return toast.error("Bedrag en reden verplicht");
              const { error } = await supabase.rpc("add_cash_movement", { _session_id: s.id, _kind: kind, _amount_cents: c, _reason: reason, _employee_id: pos.employee?.id as never });
              if (error) return toast.error(error.message);
              setAmt(""); setReason(""); void load();
            }}>Vastleggen</Button></div>
          {moves.map((m) => <div key={m.id} className="flex justify-between text-sm"><span>{fmtDateTime(m.created_at)} · {m.kind} · {m.reason}</span><span>{euro(m.amount_cents)}</span></div>)}
        </div>
      </div>
      <div className="space-y-4">
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">Kas tellen</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {DENOMS.map((d) => (
              <div key={d}><Label className="text-xs">{euro(d)}</Label><Input inputMode="numeric" value={counts[d] ?? ""} onChange={(e) => setCounts({ ...counts, [d]: e.target.value.replace(/\D/g, "") })} placeholder="0" /></div>
            ))}
          </div>
          <div className="flex justify-between"><span>Totaal per munt/biljet</span><b className="tabular">{euro(denomTotal)}</b></div>
          <div><Label>Of totaalbedrag direct invoeren</Label><Input value={totalInput} onChange={(e) => setTotalInput(e.target.value)} placeholder="bijv. 250,00" /></div>
          {sum && counted != null && <div className={`rounded-xl p-3 text-lg font-semibold ${diff === 0 ? "bg-success/15" : "bg-destructive/10 text-destructive"}`}>Geteld {euro(counted)} · verschil {euro(diff)}</div>}
          {diff !== 0 && <div><Label>Toelichting kasverschil (verplicht)</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>}
          <Button className="h-14 w-full text-lg" disabled={!pos.online || counted == null || openAttempts.length > 0} onClick={async () => {
            if (!confirm("Kassa definitief afsluiten?")) return;
            const den = Object.fromEntries(DENOMS.map((d) => [d, parseInt(counts[d] ?? "") || 0]));
            const { error } = await supabase.rpc("close_cash_session", { _session_id: s.id, _employee_id: pos.employee?.id as never, _counted_cents: counted!, _denominations: den, _note: note, _provisional: pos.pending > 0 });
            if (error) return toast.error(error.message);
            toast.success("Kassa afgesloten"); await pos.reloadSession(); void load();
          }}>Kassa afsluiten</Button>
        </div>
        <History rows={history} />
      </div>
    </div>
  );
}

function History({ rows }: { rows: Tables<"cash_sessions">[] }) {
  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Eerdere afsluitingen</h2>
      <div className="divide-y rounded-xl border bg-card text-sm">
        {rows.map((r) => (
          <div key={r.id} className="flex justify-between p-3">
            <span>{fmtDateTime(r.closed_at!)}{r.provisional && " · voorlopig"}{r.close_note && ` · ${r.close_note}`}</span>
            <span className="tabular">verwacht {euro(r.expected_cents)} · geteld {euro(r.counted_cents)} · <b className={r.difference_cents ? "text-destructive" : ""}>{euro(r.difference_cents)}</b></span>
          </div>
        ))}
      </div>
    </div>
  );
}
