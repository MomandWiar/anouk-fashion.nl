import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePos, type Product, type Category } from "@/lib/pos/store";
import { euro, fmtDateTime, parseEuro } from "@/lib/pos/money";
import type { Promotion } from "@/lib/pos/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadText, parseCsv, toCsv } from "@/lib/pos/csv";
import type { Tables } from "@/integrations/supabase/types";
import { getLabelSettings, printLabel } from "@/lib/pos/hardware";

export const Route = createFileRoute("/_authenticated/_pos/producten")({
  validateSearch: (s: Record<string, unknown>) => ({ nieuw: typeof s.nieuw === "string" ? s.nieuw : undefined }),
  head: () => ({ meta: [{ title: "Producten en voorraad · Anouk Fashion" }, { name: "description", content: "Producten, categorieën, acties en voorraad beheren." }, { property: "og:title", content: "Producten · Anouk Fashion" }, { property: "og:description", content: "Producten en voorraad." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const { nieuw } = Route.useSearch();
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Producten en voorraad</h1>
      <Tabs defaultValue="producten">
        <TabsList>
          <TabsTrigger value="producten">Producten</TabsTrigger>
          <TabsTrigger value="categorieen">Categorieën</TabsTrigger>
          <TabsTrigger value="acties">Acties</TabsTrigger>
          <TabsTrigger value="mutaties">Voorraadmutaties</TabsTrigger>
          <TabsTrigger value="import">CSV import/export</TabsTrigger>
        </TabsList>
        <TabsContent value="producten"><ProductList newBarcode={nieuw} /></TabsContent>
        <TabsContent value="categorieen"><Categories /></TabsContent>
        <TabsContent value="acties"><Promotions /></TabsContent>
        <TabsContent value="mutaties"><Movements /></TabsContent>
        <TabsContent value="import"><CsvTools /></TabsContent>
      </Tabs>
    </div>
  );
}

const cents2 = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

function ProductList({ newBarcode }: { newBarcode?: string }) {
  const pos = usePos();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<Product> | null>(newBarcode !== undefined ? { barcode: newBarcode, track_stock: true, active: true } : null);
  const [stockFor, setStockFor] = useState<Product | null>(null);
  const [lowOnly, setLowOnly] = useState(false);
  const cat = (id: string | null) => pos.categories.find((c) => c.id === id)?.name ?? "—";
  const list = pos.products.filter((p) => {
    const s = q.toLowerCase();
    const m = !s || p.name.toLowerCase().includes(s) || (p.barcode ?? "").includes(s) || cat(p.category_id).toLowerCase().includes(s);
    const low = p.track_stock && (p.stock_qty < 0 || (p.min_stock != null && p.stock_qty <= p.min_stock));
    return m && (!lowOnly || low);
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op naam, barcode, categorie" className="h-11 max-w-sm" />
        <label className="flex items-center gap-2 text-sm"><Switch checked={lowOnly} onCheckedChange={setLowOnly} />Alleen lage/negatieve voorraad</label>
        <Button className="ml-auto h-11" onClick={() => setEdit({ track_stock: true, active: true })}><Plus className="mr-2 h-4 w-4" />Nieuw product</Button>
      </div>
      <div className="overflow-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr><th className="p-2">Naam</th><th>Categorie</th><th>Maat/kleur</th><th>Barcode</th><th className="text-right">Prijs</th><th className="text-right">Inkoop</th><th className="text-right">Voorraad</th><th className="p-2"></th></tr></thead>
          <tbody>
            {list.map((p) => {
              const low = p.track_stock && (p.stock_qty < 0 || (p.min_stock != null && p.stock_qty <= p.min_stock));
              return (
                <tr key={p.id} className={`border-t ${p.active ? "" : "opacity-50"}`}>
                  <td className="p-2 font-medium">{p.name}</td><td>{cat(p.category_id)}</td><td>{[p.size, p.color].filter(Boolean).join(" · ")}</td>
                  <td className="font-mono">{p.barcode}</td><td className="text-right tabular">{euro(p.price_cents)}</td>
                  <td className="text-right tabular">{p.cost_cents != null ? euro(p.cost_cents) : "—"}</td>
                  <td className={`text-right tabular ${low ? "font-semibold text-destructive" : ""}`}>{p.track_stock ? p.stock_qty : "niet bijgehouden"}</td>
                  <td className="space-x-1 p-2 text-right">
                    {p.track_stock && <Button size="sm" variant="outline" onClick={() => setStockFor(p)}>Voorraad</Button>}
                    <Button size="sm" variant="outline" onClick={() => setEdit(p)}>Bewerken</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edit && <ProductDialog p={edit} onClose={() => setEdit(null)} />}
      {stockFor && <StockDialog target={{ product_id: stockFor.id, name: stockFor.name, qty: stockFor.stock_qty }} onClose={() => setStockFor(null)} />}
    </div>
  );
}

function ProductDialog({ p, onClose }: { p: Partial<Product>; onClose: () => void }) {
  const pos = usePos();
  const [f, setF] = useState({
    name: p.name ?? "", category_id: p.category_id ?? "", barcode: p.barcode ?? "", size: p.size ?? "", color: p.color ?? "",
    price: cents2(p.price_cents), cost: cents2(p.cost_cents), track_stock: p.track_stock ?? true, min_stock: p.min_stock?.toString() ?? "",
    stock: p.id ? "" : "0", active: p.active ?? true,
  });
  async function save() {
    const price = parseEuro(f.price);
    if (!f.name.trim() || price == null || price < 0) return toast.error("Naam en geldige prijs zijn verplicht");
    const cost = f.cost.trim() ? parseEuro(f.cost) : null;
    if (f.cost.trim() && cost == null) return toast.error("Ongeldige inkoopprijs");
    const row = {
      name: f.name.trim(), category_id: f.category_id || null, barcode: f.barcode.trim() || null, size: f.size || null, color: f.color || null,
      price_cents: price, cost_cents: cost, track_stock: f.track_stock, min_stock: f.min_stock ? parseInt(f.min_stock) : null, active: f.active, updated_at: new Date().toISOString(),
    };
    const res = p.id ? await supabase.from("products").update(row).eq("id", p.id).select().single() : await supabase.from("products").insert(row).select().single();
    if (res.error) return toast.error(res.error.code === "23505" ? "Deze barcode bestaat al" : res.error.message);
    const initial = parseInt(f.stock || "0");
    if (!p.id && initial !== 0 && f.track_stock) await supabase.rpc("adjust_stock", { _product_id: res.data.id, _category_id: null as never, _qty: initial, _reason: "levering", _note: "Beginvoorraad", _employee_id: pos.employee?.id as never });
    if (p.id && p.price_cents !== price) await supabase.from("audit_log").insert({ action: "prijs_gewijzigd", employee_id: pos.employee?.id, details: { product: p.id, from: p.price_cents, to: price } });
    const ls = getLabelSettings();
    if (ls.enabled && ls.auto && row.barcode && row.barcode !== (p.barcode ?? null)) void printLabel({ name: row.name, barcode: row.barcode, price_cents: price, size: row.size });
    toast.success("Opgeslagen"); await pos.reload(); onClose();
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{p.id ? "Product bewerken" : "Nieuw product"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Naam</Label><Input value={f.name} onChange={set("name")} /></div>
          <div><Label>Categorie</Label><select className="h-9 w-full rounded-md border bg-background px-2" value={f.category_id} onChange={set("category_id")}><option value="">—</option>{pos.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><Label>Barcode (optioneel)</Label><Input data-scan="1" value={f.barcode} onChange={set("barcode")} className="font-mono" /></div>
          <div><Label>Maat</Label><Input value={f.size} onChange={set("size")} /></div>
          <div><Label>Kleur</Label><Input value={f.color} onChange={set("color")} /></div>
          <div><Label>Verkoopprijs incl. btw</Label><Input value={f.price} onChange={set("price")} inputMode="decimal" /></div>
          <div><Label>Inkoopprijs excl. btw (optioneel)</Label><Input value={f.cost} onChange={set("cost")} inputMode="decimal" /></div>
          <label className="flex items-center gap-2"><Switch checked={f.track_stock} onCheckedChange={(v) => setF({ ...f, track_stock: v })} />Voorraad bijhouden</label>
          <div><Label>Minimumvoorraad</Label><Input value={f.min_stock} onChange={set("min_stock")} inputMode="numeric" /></div>
          {!p.id && f.track_stock && <div><Label>Beginvoorraad</Label><Input value={f.stock} onChange={set("stock")} inputMode="numeric" /></div>}
          <label className="flex items-center gap-2"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />Actief</label>
        </div>
        <DialogFooter><Button onClick={save}>Opslaan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StockDialog({ target, onClose }: { target: { product_id?: string; category_id?: string; name: string; qty: number }; onClose: () => void }) {
  const pos = usePos();
  const [reason, setReason] = useState<"levering" | "correctie" | "afgeboekt">("levering");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  async function save() {
    let n = parseInt(qty);
    if (!n) return toast.error("Vul een aantal in");
    if (reason === "afgeboekt") n = -Math.abs(n);
    const { error } = await supabase.rpc("adjust_stock", { _product_id: (target.product_id ?? null) as never, _category_id: (target.category_id ?? null) as never, _qty: n, _reason: reason, _note: note, _employee_id: pos.employee?.id as never });
    if (error) return toast.error(error.message);
    toast.success("Voorraad bijgewerkt"); await pos.reload(); onClose();
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Voorraad {target.name}</DialogTitle></DialogHeader>
        <p>Huidige voorraad: <b>{target.qty}</b></p>
        <div className="flex gap-2">{(["levering", "correctie", "afgeboekt"] as const).map((r) => <Button key={r} size="sm" variant={reason === r ? "default" : "outline"} onClick={() => setReason(r)}>{r === "levering" ? "Levering" : r === "correctie" ? "Telling/correctie" : "Beschadigd/afgeboekt"}</Button>)}</div>
        <div><Label>{reason === "correctie" ? "Verschil (+/−)" : "Aantal"}</Label><Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" /></div>
        <div><Label>Notitie</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <DialogFooter><Button onClick={save}>Opslaan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Categories() {
  const pos = usePos();
  const [name, setName] = useState("");
  const [stockFor, setStockFor] = useState<Category | null>(null);
  async function upd(id: string, patch: Partial<Category>) {
    const { error } = await supabase.from("categories").update(patch).eq("id", id);
    if (error) toast.error(error.message); else void pos.reload();
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Algemene categorievoorraad: bijv. 80 broeken. Een losse verkoop verlaagt deze voorraad als bijhouden aan staat. Producten met eigen voorraadtracking gebruiken hun eigen voorraad (nooit dubbel).</p>
      <div className="flex gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nieuwe categorie" className="max-w-xs" />
        <Button onClick={async () => { if (!name.trim()) return; const { error } = await supabase.from("categories").insert({ name: name.trim(), sort_order: pos.categories.length + 1 }); if (error) return toast.error(error.message); setName(""); void pos.reload(); }}>Toevoegen</Button></div>
      <div className="divide-y rounded-xl border bg-card">
        {pos.categories.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 p-3">
            <Input defaultValue={c.name} className="max-w-[200px]" onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && upd(c.id, { name: e.target.value.trim() })} />
            <Input type="number" defaultValue={c.sort_order} className="w-20" onBlur={(e) => upd(c.id, { sort_order: parseInt(e.target.value) || 0 })} title="Volgorde" />
            <label className="flex items-center gap-2 text-sm"><Switch checked={c.track_stock} onCheckedChange={(v) => upd(c.id, { track_stock: v })} />Categorievoorraad</label>
            {c.track_stock && <><span className={`tabular ${c.stock_qty < 0 || (c.min_stock != null && c.stock_qty <= c.min_stock) ? "text-destructive font-semibold" : ""}`}>Voorraad {c.stock_qty}</span><Button size="sm" variant="outline" onClick={() => setStockFor(c)}>Aanpassen</Button>
              <Input type="number" defaultValue={c.min_stock ?? ""} placeholder="min." className="w-20" onBlur={(e) => upd(c.id, { min_stock: e.target.value ? parseInt(e.target.value) : null })} /></>}
            <label className="ml-auto flex items-center gap-2 text-sm"><Switch checked={c.active} onCheckedChange={(v) => upd(c.id, { active: v })} />Actief</label>
          </div>
        ))}
      </div>
      {stockFor && <StockDialog target={{ category_id: stockFor.id, name: stockFor.name, qty: stockFor.stock_qty }} onClose={() => setStockFor(null)} />}
    </div>
  );
}

function Promotions() {
  const pos = usePos();
  const [edit, setEdit] = useState<Partial<Promotion> | null>(null);
  return (
    <div className="space-y-3">
      <Button onClick={() => setEdit({ qty: 2, product_ids: [], category_ids: [], active: true })}><Plus className="mr-2 h-4 w-4" />Nieuwe actie</Button>
      <div className="divide-y rounded-xl border bg-card">
        {pos.promotions.length === 0 && <p className="p-3 text-muted-foreground">Geen acties.</p>}
        {pos.promotions.map((p) => (
          <div key={p.id} className="flex items-center justify-between p-3">
            <div><div className="font-medium">{p.name} {!p.active && <span className="text-muted-foreground">(inactief)</span>}</div>
              <div className="text-sm text-muted-foreground">{p.qty} voor {euro(p.price_cents)} · {[...p.category_ids.map((id) => pos.categories.find((c) => c.id === id)?.name), ...p.product_ids.map((id) => pos.products.find((x) => x.id === id)?.name)].filter(Boolean).join(", ")}{p.starts_on && ` · vanaf ${p.starts_on}`}{p.ends_on && ` t/m ${p.ends_on}`}</div></div>
            <div className="space-x-2"><Button size="sm" variant="outline" onClick={() => setEdit(p)}>Bewerken</Button>
              <Button size="sm" variant="ghost" onClick={async () => { if (!confirm("Actie verwijderen?")) return; await supabase.from("promotions").delete().eq("id", p.id); void pos.reload(); }}>Verwijderen</Button></div>
          </div>
        ))}
      </div>
      {edit && <PromoDialog p={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PromoDialog({ p, onClose }: { p: Partial<Promotion>; onClose: () => void }) {
  const pos = usePos();
  const [name, setName] = useState(p.name ?? "");
  const [qty, setQty] = useState(String(p.qty ?? 2));
  const [price, setPrice] = useState(cents2(p.price_cents));
  const [cats, setCats] = useState<string[]>(p.category_ids ?? []);
  const [prods, setProds] = useState<string[]>(p.product_ids ?? []);
  const [from, setFrom] = useState(p.starts_on ?? "");
  const [to, setTo] = useState(p.ends_on ?? "");
  const [active, setActive] = useState(p.active ?? true);
  const [pq, setPq] = useState("");
  async function save() {
    const c = parseEuro(price); const n = parseInt(qty);
    if (!name.trim() || c == null || !(n >= 2)) return toast.error("Naam, aantal (≥2) en actieprijs verplicht");
    if (cats.length + prods.length === 0) return toast.error("Kies categorieën of artikelen");
    const row = { name: name.trim(), qty: n, price_cents: c, category_ids: cats, product_ids: prods, starts_on: from || null, ends_on: to || null, active };
    const { error } = p.id ? await supabase.from("promotions").update(row).eq("id", p.id) : await supabase.from("promotions").insert(row);
    if (error) return toast.error(error.message);
    void pos.reload(); onClose();
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Actie</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Naam (op bon)</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2 tops voor €15" /></div>
          <div><Label>Aantal</Label><Input value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div><Label>Actieprijs samen</Label><Input value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div><Label>Begindatum</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>Einddatum</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="col-span-2"><Label>Categorieën</Label><div className="flex flex-wrap gap-2">{pos.categories.map((c) => <Button key={c.id} size="sm" type="button" variant={cats.includes(c.id) ? "default" : "outline"} onClick={() => setCats(cats.includes(c.id) ? cats.filter((x) => x !== c.id) : [...cats, c.id])}>{c.name}</Button>)}</div></div>
          <div className="col-span-2"><Label>Artikelen</Label><Input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Zoek artikel…" />
            <div className="mt-1 flex flex-wrap gap-1">{prods.map((id) => <Button key={id} size="sm" onClick={() => setProds(prods.filter((x) => x !== id))}>{pos.products.find((x) => x.id === id)?.name} ×</Button>)}
              {pq.length > 1 && pos.products.filter((x) => x.name.toLowerCase().includes(pq.toLowerCase()) && !prods.includes(x.id)).slice(0, 8).map((x) => <Button key={x.id} size="sm" variant="outline" onClick={() => { setProds([...prods, x.id]); setPq(""); }}>{x.name} {x.size}</Button>)}</div></div>
          <label className="flex items-center gap-2"><Switch checked={active} onCheckedChange={setActive} />Actief</label>
        </div>
        <DialogFooter><Button onClick={save}>Opslaan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Movements() {
  const pos = usePos();
  const [rows, setRows] = useState<Tables<"stock_movements">[]>([]);
  useEffect(() => { supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(300).then(({ data }) => setRows(data ?? [])); }, []);
  return (
    <div className="overflow-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left"><tr><th className="p-2">Datum</th><th>Artikel/categorie</th><th>Reden</th><th className="text-right">Aantal</th><th>Medewerker</th><th>Notitie</th></tr></thead>
        <tbody>{rows.map((m) => (
          <tr key={m.id} className="border-t"><td className="p-2">{fmtDateTime(m.created_at)}</td>
            <td>{m.product_id ? pos.products.find((p) => p.id === m.product_id)?.name : `Categorie ${pos.categories.find((c) => c.id === m.category_id)?.name}`}</td>
            <td>{m.reason}</td><td className="text-right tabular">{m.qty_change > 0 ? "+" : ""}{m.qty_change}</td>
            <td>{pos.employees.find((e) => e.id === m.employee_id)?.name}</td><td>{m.note}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

const CSV_HEADER = ["naam", "categorie", "barcode", "maat", "kleur", "verkoopprijs", "inkoopprijs", "voorraad_bijhouden", "voorraad", "minimumvoorraad", "actief"];

function CsvTools() {
  const pos = usePos();
  const [preview, setPreview] = useState<{ row: Record<string, string>; errors: string[]; existing?: Product }[] | null>(null);
  const catByName = useMemo(() => new Map(pos.categories.map((c) => [c.name.toLowerCase(), c])), [pos.categories]);

  function exportCsv() {
    const rows = pos.products.map((p) => [p.name, pos.categories.find((c) => c.id === p.category_id)?.name ?? "", p.barcode ?? "", p.size ?? "", p.color ?? "", cents2(p.price_cents), cents2(p.cost_cents), p.track_stock ? "ja" : "nee", String(p.stock_qty), p.min_stock?.toString() ?? "", p.active ? "ja" : "nee"]);
    downloadText("producten.csv", toCsv([CSV_HEADER, ...rows]));
  }
  function example() {
    downloadText("voorbeeld-producten.csv", toCsv([CSV_HEADER, ["Jeans slim", "Broeken", "0012345678905", "38", "Blauw", "49,95", "18,50", "ja", "5", "2", "ja"], ["Sjaal", "Accessoires", "", "", "Rood", "12,00", "", "nee", "", "", "ja"]]));
  }
  async function onFile(f: File) {
    const rows = parseCsv(await f.text());
    const [head, ...body] = rows;
    const idx = (k: string) => head.findIndex((h) => h.trim().toLowerCase() === k);
    if (idx("naam") < 0 || idx("verkoopprijs") < 0) return toast.error("Kolommen 'naam' en 'verkoopprijs' zijn verplicht");
    const seen = new Set<string>();
    setPreview(body.filter((r) => r.some((c) => c.trim())).map((r) => {
      const row = Object.fromEntries(CSV_HEADER.map((k) => [k, (r[idx(k)] ?? "").trim()]));
      const errors: string[] = [];
      if (!row.naam) errors.push("naam ontbreekt");
      if (parseEuro(row.verkoopprijs) == null) errors.push("ongeldige verkoopprijs");
      if (row.inkoopprijs && parseEuro(row.inkoopprijs) == null) errors.push("ongeldige inkoopprijs");
      if (row.categorie && !catByName.has(row.categorie.toLowerCase())) errors.push(`onbekende categorie ${row.categorie}`);
      if (row.voorraad && !/^-?\d+$/.test(row.voorraad)) errors.push("ongeldige voorraad");
      if (row.barcode) { if (seen.has(row.barcode)) errors.push("dubbele barcode in bestand"); seen.add(row.barcode); }
      const existing = row.barcode ? pos.products.find((p) => p.barcode === row.barcode) : undefined;
      return { row, errors, existing };
    }));
  }
  async function doImport() {
    if (!preview) return;
    let ok = 0;
    for (const { row, errors, existing } of preview) {
      if (errors.length) continue;
      const rec = {
        name: row.naam, category_id: row.categorie ? catByName.get(row.categorie.toLowerCase())!.id : null, barcode: row.barcode || null,
        size: row.maat || null, color: row.kleur || null, price_cents: parseEuro(row.verkoopprijs)!, cost_cents: row.inkoopprijs ? parseEuro(row.inkoopprijs) : null,
        track_stock: row.voorraad_bijhouden ? /^(ja|1|true|yes)$/i.test(row.voorraad_bijhouden) : true, min_stock: row.minimumvoorraad ? parseInt(row.minimumvoorraad) : null,
        active: row.actief ? /^(ja|1|true|yes)$/i.test(row.actief) : true,
      };
      const res = existing ? await supabase.from("products").update(rec).eq("id", existing.id).select().single() : await supabase.from("products").insert(rec).select().single();
      if (res.error) { toast.error(`${row.naam}: ${res.error.message}`); continue; }
      const target = row.voorraad ? parseInt(row.voorraad) : null;
      const cur = existing?.stock_qty ?? 0;
      if (target != null && rec.track_stock && target !== cur)
        await supabase.rpc("adjust_stock", { _product_id: res.data.id, _category_id: null as never, _qty: target - cur, _reason: "correctie", _note: "CSV-import", _employee_id: pos.employee?.id as never });
      ok++;
    }
    toast.success(`${ok} producten geïmporteerd`); setPreview(null); void pos.reload();
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Exporteren</Button>
        <Button variant="outline" onClick={example}><Download className="mr-2 h-4 w-4" />Voorbeeldbestand</Button>
        <label className="inline-flex cursor-pointer items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Upload className="mr-2 h-4 w-4" />CSV kiezen<input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
      </div>
      <p className="text-sm text-muted-foreground">Scheidingsteken ; of ,. Barcodes blijven tekst (voorloopnullen blijven behouden). Bestaande producten worden op barcode bijgewerkt.</p>
      {preview && (
        <div className="space-y-2">
          <div className="overflow-auto rounded-xl border bg-card">
            <table className="w-full text-sm"><thead className="bg-muted text-left"><tr><th className="p-2">Naam</th><th>Barcode</th><th>Prijs</th><th>Actie</th><th>Status</th></tr></thead>
              <tbody>{preview.map((r, i) => <tr key={i} className="border-t"><td className="p-2">{r.row.naam}</td><td className="font-mono">{r.row.barcode}</td><td>{r.row.verkoopprijs}</td><td>{r.existing ? "bijwerken" : "nieuw"}</td><td className={r.errors.length ? "text-destructive" : "text-success"}>{r.errors.join(", ") || "ok"}</td></tr>)}</tbody></table>
          </div>
          <Button onClick={doImport}>Importeren ({preview.filter((r) => !r.errors.length).length} geldige regels)</Button>
        </div>
      )}
    </div>
  );
}
