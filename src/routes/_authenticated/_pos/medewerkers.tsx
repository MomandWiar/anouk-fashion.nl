import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePos } from "@/lib/pos/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/_pos/medewerkers")({
  head: () => ({ meta: [{ title: "Medewerkers · Anouk Fashion" }, { name: "description", content: "Medewerkers en pincodes beheren." }, { property: "og:title", content: "Medewerkers · Anouk Fashion" }, { property: "og:description", content: "Medewerkers beheren." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const pos = usePos();
  const [name, setName] = useState("");
  return (
    <div className="max-w-3xl space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Medewerkers</h1>
      <p className="text-sm text-muted-foreground">Alle medewerkers hebben dezelfde rechten. Persoonlijke pincodes zijn {pos.settings?.require_pin ? <b>verplicht</b> : "niet verplicht"} (wijzigen in Instellingen).</p>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam" className="h-11 max-w-xs" />
        <Button className="h-11" onClick={async () => { if (!name.trim()) return; const { error } = await supabase.from("employees").insert({ name: name.trim() }); if (error) return toast.error(error.message); setName(""); void pos.reload(); }}>Toevoegen</Button>
      </div>
      <div className="divide-y rounded-xl border bg-card">
        {pos.employees.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-3 p-3">
            <Input defaultValue={e.name} className="max-w-[220px]" onBlur={async (ev) => { const v = ev.target.value.trim(); if (v && v !== e.name) { await supabase.from("employees").update({ name: v }).eq("id", e.id); void pos.reload(); } }} />
            <span className="text-sm text-muted-foreground">{e.has_pin ? "pincode ingesteld" : "geen pincode"}</span>
            <Button size="sm" variant="outline" onClick={async () => {
              const pin = prompt(`Nieuwe pincode voor ${e.name} (4–8 cijfers, leeg = verwijderen)`);
              if (pin === null) return;
              const { error } = await supabase.rpc("set_employee_pin", { _employee_id: e.id, _pin: pin });
              if (error) return toast.error(error.message);
              toast.success("Pincode bijgewerkt"); void pos.reload();
            }}>Pincode</Button>
            <label className="ml-auto flex items-center gap-2 text-sm"><Switch checked={e.active} onCheckedChange={async (v) => { await supabase.from("employees").update({ active: v }).eq("id", e.id); void pos.reload(); }} />Actief</label>
          </div>
        ))}
      </div>
    </div>
  );
}
