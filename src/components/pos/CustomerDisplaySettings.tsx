import { useEffect, useState } from "react";
import { Monitor, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { customerDisplayEnabled, openCustomerDisplay, setCustomerDisplayEnabled } from "@/lib/pos/customer-display";

export function CustomerDisplaySettings() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => { setEnabled(customerDisplayEnabled()); }, []);
  async function open() {
    const result = await openCustomerDisplay(true);
    setStatus(result === "blocked" ? "Openen geblokkeerd. Sta pop-ups voor deze kassa toe en probeer opnieuw." : result === "manual" ? "Venster geopend. Verplaats het naar het klantenscherm; automatische schermkeuze is niet beschikbaar of niet toegestaan." : "Venster geopend op het tweede scherm.");
  }
  return <div className="space-y-3">
    <label className="flex items-center gap-3"><Switch aria-label="Klantendisplay aan" checked={enabled} onCheckedChange={(value) => { setEnabled(value); setCustomerDisplayEnabled(value); if (value) void open(); else setStatus("Klantendisplay uitgeschakeld."); }} />Klantendisplay automatisch openen bij opstarten</label>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!enabled} onClick={open}><Monitor />Klantenscherm openen / verbinden</Button><Button variant="ghost" asChild><a href="/klantendisplay" target="anouk-customer-display"><ExternalLink />Bekijken</a></Button></div>
    <p className="text-sm text-muted-foreground">Voor een tweede scherm aangesloten op deze kassacomputer. Sta eenmalig pop-ups en schermtoegang toe. Deze instelling geldt voor dit apparaat.</p>
    {status && <p role="status" className="text-sm">{status}</p>}
  </div>;
}