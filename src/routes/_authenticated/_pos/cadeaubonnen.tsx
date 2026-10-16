import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePos } from "@/lib/pos/store";
import { euro, fmtDateTime } from "@/lib/pos/money";
import { Barcode128, printNode } from "@/components/pos/Receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/_pos/cadeaubonnen")({
  head: () => ({ meta: [{ title: "Cadeaubonnen · Anouk Fashion" }, { name: "description", content: "Saldo en geschiedenis van cadeaubonnen." }, { property: "og:title", content: "Cadeaubonnen · Anouk Fashion" }, { property: "og:description", content: "Cadeaubonnen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: GiftCardsPage,
});

type GC = Tables<"gift_cards"> & { gift_card_transactions: Tables<"gift_card_transactions">[] };

function GiftCardsPage() {
  const pos = usePos();
  const [code, setCode] = useState("");
  const [card, setCard] = useState<GC | null>(null);
  const [recent, setRecent] = useState<Tables<"gift_cards">[]>([]);
  useEffect(() => { supabase.from("gift_cards").select("*").order("created_at", { ascending: false }).limit(50).then(({ data }) => setRecent(data ?? [])); }, []);
  async function lookup(c = code) {
    const { data, error } = await supabase.from("gift_cards").select("*, gift_card_transactions(*)").eq("code", c.trim()).maybeSingle();
    if (error) return toast.error(pos.online ? error.message : "Saldo opvragen vereist internet");
    if (!data) return toast.error("Cadeaubon niet gevonden");
    setCard(data as GC);
  }
  const s = pos.settings;
  function print(c: Tables<"gift_cards">) {
    void printNode(
      <div style={{ width: s?.paper_width === 58 ? "58mm" : "80mm", padding: "4mm", fontFamily: "ui-monospace, monospace", textAlign: "center", color: "#000" }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{s?.shop_name}</div>
        <div>{s?.address}</div><div>{s?.postal_city}</div>
        <div style={{ fontSize: 20, fontWeight: 700, margin: "10px 0" }}>CADEAUBON</div>
        <div>Waarde {euro(c.initial_cents)}</div>
        <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}><Barcode128 value={c.code} /></div>
        <div style={{ letterSpacing: 2 }}>{c.code}</div>
        <div style={{ marginTop: 6 }}>Uitgegeven {fmtDateTime(c.created_at)}</div>
      </div>,
    );
  }
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Cadeaubonnen</h1>
        {s?.giftcard_vat_mode === "unset" && <p className="rounded-xl bg-warning p-3 text-warning-foreground">Inrichtingstaak: stel de btw-behandeling van cadeaubonnen vast in <Link to="/instellingen" className="underline">Instellingen</Link>. Tot dan kunnen geen bonnen worden verkocht.</p>}
        <p className="text-sm text-muted-foreground">Een cadeaubon verkoopt u via de kassa (knop “Cadeaubon verkopen”). Hij wordt actief zodra de betaling is voltooid.</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void lookup(); }}>
          <Input data-scan="1" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="Scan of typ code" className="h-12 font-mono text-lg" />
          <Button className="h-12">Saldo opzoeken</Button>
        </form>
        {card && (
          <div className="space-y-3 rounded-2xl border bg-card p-4">
            <div className="flex items-start justify-between">
              <div><div className="font-mono text-lg">{card.code}</div><div className="text-sm text-muted-foreground">Uitgegeven {fmtDateTime(card.created_at)} · beginwaarde {euro(card.initial_cents)}</div></div>
              <div className="text-right"><div className="text-sm">Saldo</div><div className="font-display text-3xl font-bold">{euro(card.balance_cents)}</div></div>
            </div>
            <table className="w-full text-sm"><tbody>
              {card.gift_card_transactions.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((t) => (
                <tr key={t.id} className="border-t"><td className="py-1">{fmtDateTime(t.created_at)}</td><td>{t.kind}</td><td className="text-right tabular">{euro(t.amount_cents)}</td><td className="text-right tabular text-muted-foreground">saldo {euro(t.balance_after_cents)}</td></tr>
              ))}
            </tbody></table>
            <Button variant="outline" onClick={() => print(card)}><Printer className="mr-2 h-4 w-4" />Cadeaubon printen</Button>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <h2 className="font-semibold">Recent uitgegeven</h2>
        <div className="divide-y rounded-xl border bg-card">
          {recent.map((c) => (
            <button key={c.id} onClick={() => { setCode(c.code); void lookup(c.code); }} className="flex w-full justify-between p-3 text-left hover:bg-muted">
              <span className="font-mono">{c.code}</span><span className="tabular">{euro(c.balance_cents)} / {euro(c.initial_cents)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
