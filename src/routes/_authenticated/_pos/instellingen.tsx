import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePos, type Settings } from "@/lib/pos/store";
import { clearAllLocal, queueAll } from "@/lib/pos/local-db";
import { downloadText } from "@/lib/pos/csv";
import { printReceipt } from "@/components/pos/Receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CustomerDisplaySettings } from "@/components/pos/CustomerDisplaySettings";
import { CategoryManager, DrawerSettings, KeyboardSettings, LabelPrinterSettings } from "@/components/pos/HardwareSettings";

export const Route = createFileRoute("/_authenticated/_pos/instellingen")({
  head: () => ({ meta: [{ title: "Instellingen · Anouk Fashion" }, { name: "description", content: "Winkel-, printer- en betaalinstellingen." }, { property: "og:title", content: "Instellingen · Anouk Fashion" }, { property: "og:description", content: "Instellingen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SettingsPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-2xl border bg-card p-5"><h2 className="text-lg font-semibold">{title}</h2>{children}</section>;
}
function Status({ ok, text }: { ok: boolean; text: string }) {
  return <span className={`rounded-md px-2 py-0.5 text-sm font-medium ${ok ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{text}</span>;
}

function SettingsPage() {
  const pos = usePos();
  const [f, setF] = useState<Settings | null>(pos.settings);
  const [owner, setOwner] = useState(false);
  useEffect(() => { setF(pos.settings); }, [pos.settings]);
  if (!f) return <div className="p-6">Laden…</div>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF({ ...f, [k]: v });

  async function save(patch?: Partial<Settings>) {
    const row = { ...f!, ...patch, updated_at: new Date().toISOString() };
    const { id: _id, ...rest } = row;
    const { error } = await supabase.from("shop_settings").update(rest).eq("id", 1);
    if (error) return toast.error(error.message);
    await supabase.from("audit_log").insert({ action: "instellingen_gewijzigd", employee_id: pos.employee?.id, details: { keys: Object.keys(patch ?? {}) } });
    toast.success("Opgeslagen"); void pos.reload();
  }

  async function onLogo(file: File) {
    if (file.size > 300_000) return toast.error("Logo maximaal 300 kB");
    const r = new FileReader();
    r.onload = () => set("logo_data_url", String(r.result));
    r.readAsDataURL(file);
  }

  const terminalConfigured = !!f.pin_provider && !!f.pin_terminal_id && false; // no real provider integration installed yet

  return (
    <div className="max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Instellingen</h1><Button className="h-11" onClick={() => save()}>Alles opslaan</Button></div>

      <Section title="Winkelgegevens en bon">
        <div className="grid gap-3 md:grid-cols-3">
          <div><Label>Winkelnaam</Label><Input value={f.shop_name} onChange={(e) => set("shop_name", e.target.value)} /></div>
          <div><Label>Adres</Label><Input value={f.address} onChange={(e) => set("address", e.target.value)} /></div>
          <div><Label>Postcode en plaats</Label><Input value={f.postal_city} onChange={(e) => set("postal_city", e.target.value)} /></div>
        </div>
        <div className="flex items-center gap-3">
          {f.logo_data_url && <img src={f.logo_data_url} alt="Logo" className="h-14 rounded border bg-background object-contain p-1" />}
          <label className="cursor-pointer rounded-md border px-3 py-2 text-sm">Logo kiezen<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} /></label>
          {f.logo_data_url && <Button variant="ghost" size="sm" onClick={() => set("logo_data_url", null)}>Verwijderen</Button>}
        </div>
        <div><Label>Retourtekst op bon</Label><Textarea value={f.return_text} onChange={(e) => set("return_text", e.target.value)} /></div>
        <div><Label>Bedanktekst</Label><Textarea value={f.thank_you_text} onChange={(e) => set("thank_you_text", e.target.value)} /></div>
        <div className="w-40"><Label>Ruiltermijn (dagen)</Label><Input type="number" value={f.exchange_days} onChange={(e) => set("exchange_days", parseInt(e.target.value) || 8)} /></div>
      </Section>

      <Section title="Medewerkers">
        <label className="flex items-center gap-3"><Switch checked={f.require_pin} onCheckedChange={(v) => set("require_pin", v)} />Persoonlijke pincode verplicht bij kiezen van medewerker</label>
        <p className="text-sm text-muted-foreground">Pincodes worden versleuteld opgeslagen; na 5 mislukte pogingen 5 minuten geblokkeerd.</p>
      </Section>

      <Section title="Bonprinter en kassalade">
        <div className="grid gap-3 md:grid-cols-3">
          <div><Label>Printertype</Label><select className="h-9 w-full rounded-md border bg-background px-2" value={f.printer_type} onChange={(e) => set("printer_type", e.target.value)}><option value="browser">Windows/browserprint</option><option value="escpos_network">ESC/POS netwerkprinter (via printbrug)</option></select></div>
          <div><Label>Verbinding</Label><select className="h-9 w-full rounded-md border bg-background px-2" value={f.printer_connection} onChange={(e) => set("printer_connection", e.target.value)}><option value="browser">Printvenster</option><option value="network">Netwerk (IP)</option></select></div>
          <div><Label>Netwerkadres</Label><Input value={f.printer_address ?? ""} onChange={(e) => set("printer_address", e.target.value)} placeholder="bijv. 192.168.1.50:9100" /></div>
          <div><Label>Papierbreedte</Label><select className="h-9 w-full rounded-md border bg-background px-2" value={f.paper_width} onChange={(e) => set("paper_width", parseInt(e.target.value))}><option value={80}>80 mm</option><option value={58}>58 mm</option></select></div>
          <div><Label>Aantal exemplaren</Label><Input type="number" min={1} max={5} value={f.print_copies} onChange={(e) => set("print_copies", Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))} /></div>
          <label className="flex items-center gap-3 pt-6"><Switch checked={f.auto_print} onCheckedChange={(v) => set("auto_print", v)} />Automatisch printen</label>
        </div>
        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>Aclas PP7X (ESC/POS) instellen</strong>
            <Button size="sm" onClick={() => { set("printer_type", "browser"); set("printer_connection", "browser"); set("paper_width", 80); set("printer_address", ""); toast.success("Aclas PP7X-instelling toegepast — klik op Opslaan"); }}>Aclas PP7X instellen</Button>
          </div>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Installeer het Windows-stuurprogramma "PP7X" van aclas.com (Support → Download).</li>
            <li>Maak de PP7X in Windows de <b>standaardprinter</b>, papier 80 mm, marges 0.</li>
            <li>Klik hierboven op <b>Aclas PP7X instellen</b> en daarna op <b>Opslaan</b>.</li>
            <li>Printen zonder venster: open de kassa via een Chrome/Edge-snelkoppeling met <code>--kiosk-printing</code> achter het doel.</li>
            <li>Sluit het programma dat "command not found" meldt; het hoeft niet tussen kassa en printer.</li>
          </ol>
          <p className="text-muted-foreground">Rechtstreeks ESC/POS-codes sturen: <Status ok={false} text="Niet geconfigureerd" /> — dat kan een webpagina niet zonder lokale printbrug (bijv. QZ Tray).</p>
        </div>
        <Button variant="outline" onClick={() => printReceipt({
          shop: { name: f.shop_name, address: f.address, postal_city: f.postal_city, logo: f.logo_data_url, thank_you: f.thank_you_text, return_text: f.return_text },
          receipt_number: "000000000000", created_at: new Date().toISOString(), employee: pos.employee?.name ?? "-", is_test: true,
          lines: [{ description: "Testregel", qty: 1, unit_price_cents: 1200, original_cents: 1200, discount_cents: 0, final_cents: 1200, note: null }],
          total_cents: 1200, discount_cents: 0, vat: [{ rate: 21, base_cents: 992, vat_cents: 208 }], payments: [{ method: "cash", amount_cents: 1200, tendered_cents: 2000, change_cents: 800 }],
        }, f.paper_width, 1)}>Testbon printen</Button>
        <DrawerSettings />
      </Section>

      <Section title="Categorieën (linkerlijst kassa)"><CategoryManager /></Section>

      <Section title="Etiketten maken (labelprinter)"><LabelPrinterSettings /></Section>

      <Section title="Barcodescanner">
        <p className="text-sm">Sluit de scanner via USB aan; hij werkt als toetsenbord. Op het kassascherm wordt een gescand artikel direct aan de aankoop toegevoegd, ook als het zoekveld niet actief is. Zorg dat de scanner na elke code een Enter stuurt (standaardinstelling).</p>
      </Section>

      <Section title="Schermtoetsenbord (touchscreen)"><KeyboardSettings /></Section>

      <Section title="Klantendisplay"><CustomerDisplaySettings /></Section>

      <Section title="Pinapparaat">
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Provider</Label><Input value={f.pin_provider ?? ""} onChange={(e) => set("pin_provider", e.target.value || null)} placeholder="bijv. CCV, Worldline, Adyen, SumUp" /></div>
          <div><Label>Terminal-ID</Label><Input value={f.pin_terminal_id ?? ""} onChange={(e) => set("pin_terminal_id", e.target.value || null)} /></div>
        </div>
        <label className="flex items-center gap-3"><Switch checked={f.pin_auto_enabled && terminalConfigured} disabled={!terminalConfigured} onCheckedChange={(v) => set("pin_auto_enabled", v)} />Automatische pinkoppeling</label>
        <p className="text-sm">Status: <Status ok={terminalConfigured} text={terminalConfigured ? "Verbonden" : "Niet geconfigureerd"} /> — zodra provider en model bekend zijn, wordt de koppeling (met serverzijdige sleutels en geverifieerde callbacks) gebouwd. Tot die tijd: bedrag zelf op de terminal invoeren en in de kassa bevestigen.</p>
      </Section>

      <Section title="Cadeaubonnen">
        <Label>Btw-behandeling</Label>
        <select className="h-10 w-full max-w-md rounded-md border bg-background px-2" value={f.giftcard_vat_mode} onChange={(e) => set("giftcard_vat_mode", e.target.value)}>
          <option value="unset">Nog niet vastgesteld</option>
          <option value="multi_purpose">Meervoudige voucher: geen btw bij uitgifte, btw bij besteding</option>
        </select>
        {f.giftcard_vat_mode === "unset" && <p className="rounded-lg bg-warning p-2 text-sm text-warning-foreground">Inrichtingstaak: bevestig (eventueel met uw boekhouder) de btw-behandeling. Tot dan is verkoop van cadeaubonnen uitgeschakeld.</p>}
      </Section>

      <Section title="Testmodus">
        <label className="flex items-center gap-3"><Switch checked={f.test_mode} onCheckedChange={(v) => save({ test_mode: v })} />Testmodus (verkopen worden als TEST gemarkeerd, tellen niet mee in rapportages en wijzigen geen voorraad)</label>
      </Section>

      <Section title="Eigenaar: export, back-up en herstel">
        {!owner ? <OwnerUnlock onOk={() => setOwner(true)} /> : <OwnerTools />}
      </Section>
    </div>
  );
}

function OwnerUnlock({ onOk }: { onOk: () => void }) {
  const [pw, setPw] = useState("");
  return (
    <form className="flex gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const { data } = await supabase.auth.getUser();
      const { data: isOwner } = await supabase.rpc("has_role", { _user_id: data.user!.id, _role: "owner" });
      if (!isOwner) return toast.error("Alleen het eigenaarsaccount");
      const { error } = await supabase.auth.signInWithPassword({ email: data.user!.email!, password: pw });
      if (error) return toast.error("Onjuist wachtwoord");
      onOk();
    }}>
      <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Wachtwoord eigenaarsaccount" className="max-w-xs" />
      <Button>Ontgrendelen</Button>
    </form>
  );
}

const TABLES = ["shop_settings", "registers", "employees", "categories", "products", "stock_movements", "promotions", "cash_sessions", "cash_movements", "sales", "sale_lines", "payments", "payment_attempts", "gift_cards", "gift_card_transactions", "returns", "return_lines", "parked_carts", "audit_log"] as const;

function OwnerTools() {
  const pos = usePos();
  async function exportAll() {
    const out: Record<string, unknown[]> = {};
    for (const t of TABLES) {
      const rows: unknown[] = [];
      for (let i = 0; ; i += 1000) {
        const { data, error } = await supabase.from(t).select("*").range(i, i + 999);
        if (error) return toast.error(`${t}: ${error.message}`);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      out[t] = rows;
    }
    downloadText(`anouk-kassa-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exported_at: new Date().toISOString(), tables: out }, null, 1), "application/json");
    await supabase.from("audit_log").insert({ action: "volledige_export", employee_id: pos.employee?.id });
  }
  return (
    <div className="space-y-3 text-sm">
      <Button onClick={exportAll}>Volledige gegevensexport (JSON)</Button>
      <div className="space-y-1 rounded-xl bg-muted p-3">
        <p><b>Automatische back-up:</b> de database van Lovable Cloud wordt door het platform dagelijks geback-upt; terugzetten gebeurt via Lovable support/Cloud-instellingen, niet vanuit de kassa. Deze kassa toont daarom geen “back-up geslaagd”.</p>
        <p><b>Eigen back-up:</b> maak wekelijks een volledige export hierboven en bewaar die op een veilige plek (bijv. USB-stick en cloudopslag).</p>
        <p><b>Herstel testen:</b> herstel een export alleen in een aparte testomgeving (kopie van dit project). Medewerkers kunnen de database niet vervangen.</p>
      </div>
      <Button variant="destructive" onClick={async () => {
        const q = await queueAll();
        if (q.length && !confirm(`LET OP: ${q.length} verkopen zijn nog niet gesynchroniseerd en gaan verloren. Toch wissen?`)) return;
        if (!confirm("Alle lokale kassagegevens op dit apparaat wissen?")) return;
        await clearAllLocal(); toast.success("Lokale gegevens gewist"); location.reload();
      }}>Lokale gegevens op dit apparaat wissen</Button>
    </div>
  );
}
