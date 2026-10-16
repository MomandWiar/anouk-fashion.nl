import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BarcodeCamera } from "@/components/pos/BarcodeCamera";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { usePos } from "@/lib/pos/store";
import { parseEuro } from "@/lib/pos/money";

export const Route = createFileRoute("/_authenticated/_pos/artikel-scannen")({
  head: () => ({ meta: [{ title: "Artikel scannen · Anouk Fashion" }, { name: "description", content: "Artikelen scannen en toevoegen aan de winkelvoorraad." }, { property: "og:title", content: "Artikel scannen · Anouk Fashion" }, { property: "og:description", content: "Artikelen toevoegen met een barcode en beginvoorraad." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ScanArticlePage,
});

function ScanArticlePage() {
  const pos = usePos();
  const [f, setF] = useState({ barcode: "", name: "", category: "", size: "", price: "", stock: "0" });
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const saving = useRef(false);
  const barcodeInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const field = (key: keyof typeof f, value: string) => { if (!createdId && !busy) setF((prev) => ({ ...prev, [key]: value })); };
  async function save() {
    if (saving.current || !pos.online || !pos.employee) return;
    const price = parseEuro(f.price);
    if (!f.barcode.trim() || !f.name.trim() || price == null || price < 0 || !/^\d+$/.test(f.stock) || !Number.isSafeInteger(Number(f.stock))) return toast.error("Vul een barcode, naam, geldige prijs en heel voorraadaantal in.");
    saving.current = true; setBusy(true);
    try {
      let id = createdId;
      if (!id) {
        const { data, error } = await supabase.from("products").insert({ barcode: f.barcode.trim(), name: f.name.trim(), category_id: f.category || null, size: f.size.trim() || null, price_cents: price, track_stock: true, active: true }).select("id").single();
        if (error) throw new Error(error.code === "23505" ? "Deze barcode bestaat al. Bewerk het artikel onder Artikelen." : error.message);
        id = data.id; setCreatedId(id);
      }
      const qty = Number(f.stock);
      if (qty > 0) {
        const { error } = await supabase.rpc("adjust_stock", { _product_id: id, _category_id: null as never, _qty: qty, _reason: "levering", _note: "Beginvoorraad via scan", _employee_id: pos.employee.id });
        if (error) throw new Error(`Artikel is aangemaakt, maar beginvoorraad niet opgeslagen: ${error.message}. Probeer opnieuw.`);
      }
      setLastSaved(`${f.name} · ${f.barcode}`);
      setCreatedId(null); setF((prev) => ({ ...prev, barcode: "", name: "", size: "", price: "", stock: "0" }));
      await pos.reload(); toast.success("Artikel en voorraad opgeslagen"); barcodeInput.current?.focus();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
    finally { saving.current = false; setBusy(false); }
  }
  return <section className="pos-scan-content">
    <h1 className="mb-4 text-lg font-semibold">Artikel toevoegen via scan</h1>
    <div className="pos-scan-grid">
      <BarcodeCamera onScan={(code) => { if (createdId || busy) return; setF((prev) => ({ ...prev, barcode: code })); nameInput.current?.focus(); }} />
      <form className="min-w-0" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <fieldset disabled={busy || !!createdId} className="grid grid-cols-2 gap-4">
          <div><Label htmlFor="scan-barcode">Barcode</Label><Input ref={barcodeInput} id="scan-barcode" data-scan="1" value={f.barcode} onChange={(e) => field("barcode", e.target.value)} required /></div>
          <div><Label htmlFor="scan-name">Naam</Label><Input ref={nameInput} id="scan-name" value={f.name} onChange={(e) => field("name", e.target.value)} required /></div>
          <div><Label htmlFor="scan-category">Categorie</Label><select id="scan-category" className="h-9 w-full rounded-md border bg-card px-2 text-sm" value={f.category} onChange={(e) => field("category", e.target.value)}><option value="">Geen categorie</option>{pos.categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><Label htmlFor="scan-size">Maat</Label><Input id="scan-size" value={f.size} onChange={(e) => field("size", e.target.value)} /></div>
          <div><Label htmlFor="scan-price">Prijs incl. btw</Label><Input id="scan-price" inputMode="decimal" placeholder="0,00" value={f.price} onChange={(e) => field("price", e.target.value)} required /></div>
          <div><Label htmlFor="scan-stock">Beginvoorraad</Label><Input id="scan-stock" inputMode="numeric" value={f.stock} onChange={(e) => field("stock", e.target.value)} required /></div>
        </fieldset>
        <Button type="submit" className="mt-4 h-11 w-full bg-success text-success-foreground hover:bg-success/90" disabled={busy || !pos.online || !pos.employee}>{busy ? "Opslaan…" : createdId ? "Beginvoorraad opnieuw opslaan" : "Opslaan en volgende scannen"}</Button>
        {!pos.online && <p className="mt-3 text-sm text-destructive">Artikelen opslaan kan alleen online.</p>}
        {lastSaved && <p role="status" className="mt-3 text-sm text-success">Opgeslagen: {lastSaved}</p>}
      </form>
    </div>
  </section>;
}