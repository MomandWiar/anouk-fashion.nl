import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { usePos } from "@/lib/pos/store";
import { drawerAutoEnabled, drawerLinked, drawerSupported, getLabelSettings, linkDrawer, openDrawer, printLabel, setDrawerAuto, setLabelSettings, type LabelSettings } from "@/lib/pos/hardware";
import { oskEnabled, setOskEnabled } from "@/lib/pos/keyboard";

const badge = (ok: boolean, t: string) => <span className={`rounded-md px-2 py-0.5 text-sm font-medium ${ok ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{t}</span>;

export function DrawerSettings() {
  const [linked, setLinked] = useState(false);
  const [auto, setAuto] = useState(false);
  const [supported, setSupported] = useState(true);
  useEffect(() => { setSupported(drawerSupported()); setAuto(drawerAutoEnabled()); void drawerLinked().then(setLinked); }, []);
  return <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
    <p>Kassalade: {badge(linked, linked ? "Gekoppeld" : "Niet geconfigureerd")}</p>
    {!supported ? <p className="text-muted-foreground">Deze browser kan geen lade aansturen. Gebruik Chrome of Edge op de kassacomputer.</p> : <>
      <p className="text-muted-foreground">Koppel alleen een COM-poort die de ESC/POS-opdracht voor de kassalade ondersteunt. Gebruik niet de PP7X-printerpoort als die een bon met “Command not supported” print; laat automatisch openen dan uit en laat de Aclas-leverancier de juiste ladepoort of ESC/POS-modus instellen.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={async () => { if (await linkDrawer()) { setLinked(true); toast.success("Lade gekoppeld"); } }}>Lade koppelen</Button>
        <Button size="sm" variant="outline" disabled={!linked} onClick={async () => { const r = await openDrawer(); r === "ok" ? toast.success("Lade-signaal verstuurd") : toast.error("Lade openen mislukt"); }}>Test: lade openen</Button>
      </div>
      <label className="flex items-center gap-3"><Switch checked={auto} onCheckedChange={(v) => { setAuto(v); setDrawerAuto(v); }} />Lade automatisch openen na contante betaling</label>
    </>}
  </div>;
}

export function LabelPrinterSettings() {
  const [s, setS] = useState<LabelSettings | null>(null);
  useEffect(() => { setS(getLabelSettings()); }, []);
  if (!s) return null;
  const upd = (p: Partial<LabelSettings>) => { const n = { ...s, ...p }; setS(n); setLabelSettings(n); };
  return <div className="space-y-3 text-sm">
    <label className="flex items-center gap-3"><Switch checked={s.enabled} onCheckedChange={(v) => upd({ enabled: v })} />Etiketten maken aan</label>
    <label className="flex items-center gap-3"><Switch checked={s.auto} disabled={!s.enabled} onCheckedChange={(v) => upd({ auto: v })} />Automatisch etiket printen na opslaan van een artikel met barcode</label>
    <div className="flex gap-3">
      <div className="w-32"><Label>Breedte (mm)</Label><Input type="number" value={s.width_mm} onChange={(e) => upd({ width_mm: parseInt(e.target.value) || 50 })} /></div>
      <div className="w-32"><Label>Hoogte (mm)</Label><Input type="number" value={s.height_mm} onChange={(e) => upd({ height_mm: parseInt(e.target.value) || 30 })} /></div>
    </div>
    <p className="text-muted-foreground">Het etiket gaat via het Windows-printvenster. Kies daar de labelprinter (of maak in Chrome een aparte snelkoppeling). Instelling geldt voor deze computer.</p>
    <Button size="sm" variant="outline" disabled={!s.enabled} onClick={() => printLabel({ name: "Testetiket", barcode: "8712345678906", price_cents: 4995, size: "M" })}>Testetiket printen</Button>
  </div>;
}

export function KeyboardSettings() {
  const [on, setOn] = useState(true);
  useEffect(() => { setOn(oskEnabled()); }, []);
  return <div className="space-y-2 text-sm">
    <label className="flex items-center gap-3"><Switch checked={on} onCheckedChange={(v) => { setOn(v); setOskEnabled(v); }} />Schermtoetsenbord tonen bij tekst- en getalvelden</label>
    <p className="text-muted-foreground">Voor touchscreens zonder toetsenbord. Het toetsenbord verschijnt onderaan zodra u in een veld tikt. Instelling geldt voor deze computer.</p>
  </div>;
}

export function CategoryManager() {
  const pos = usePos();
  const [name, setName] = useState("");
  async function add() {
    const n = name.trim(); if (!n) return;
    const max = Math.max(0, ...pos.categories.map((c) => c.sort_order));
    const { error } = await supabase.from("categories").insert({ name: n, sort_order: max + 1, active: true });
    if (error) return toast.error(error.message);
    setName(""); toast.success("Toegevoegd"); void pos.reload();
  }
  async function remove(id: string, n: string) {
    if (!confirm(`"${n}" uit de lijst verwijderen?`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) { // still referenced by products/sales: hide instead
      const r = await supabase.from("categories").update({ active: false }).eq("id", id);
      if (r.error) return toast.error(r.error.message);
    }
    toast.success("Verwijderd"); void pos.reload();
  }
  async function restore(id: string) { await supabase.from("categories").update({ active: true }).eq("id", id); void pos.reload(); }
  return <div className="space-y-3">
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nieuwe categorie, bijv. Schoenen" className="max-w-xs" />
      <Button>Toevoegen</Button>
    </form>
    <ul className="divide-y rounded-md border">
      {pos.categories.map((c) => <li key={c.id} className="flex items-center justify-between px-3 py-2">
        <span className={c.active ? "" : "text-muted-foreground line-through"}>{c.name}</span>
        {c.active ? <Button size="sm" variant="ghost" onClick={() => remove(c.id, c.name)}>Verwijderen</Button> : <Button size="sm" variant="ghost" onClick={() => restore(c.id)}>Terugzetten</Button>}
      </li>)}
    </ul>
  </div>;
}
