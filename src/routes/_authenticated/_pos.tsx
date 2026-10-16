import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ShoppingBag, Receipt, RotateCcw, Package, Gift, Wallet, BarChart3, Users, Settings, Wifi, WifiOff, RefreshCw, LogOut, UserRound, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PosProvider, usePos, type Employee } from "@/lib/pos/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fmtDateTime } from "@/lib/pos/money";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ManagementLayout } from "@/components/pos/ManagementLayout";
import { BrandLogo } from "@/components/pos/BrandLogo";
import { customerDisplayEnabled, openCustomerDisplay, publishDisplay, welcomeDisplay } from "@/lib/pos/customer-display";
import { OnScreenKeyboard } from "@/components/pos/OnScreenKeyboard";

export const Route = createFileRoute("/_authenticated/_pos")({
  component: PosLayout,
});

const nav = [
  { to: "/kassa", label: "Kassa", icon: ShoppingBag },
  { to: "/verkopen", label: "Verkopen", icon: Receipt },
  { to: "/retouren", label: "Ruilen & retour", icon: RotateCcw },
  { to: "/producten", label: "Producten", icon: Package },
  { to: "/artikel-scannen", label: "Artikel scannen", icon: Package },
  { to: "/cadeaubonnen", label: "Cadeaubonnen", icon: Gift },
  { to: "/dagafsluiting", label: "Dagafsluiting", icon: Wallet },
  { to: "/rapportages", label: "Rapportages", icon: BarChart3 },
  { to: "/medewerkers", label: "Medewerkers", icon: Users },
  { to: "/instellingen", label: "Instellingen", icon: Settings },
] as const;

function PosLayout() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.from("user_roles").select("role").then(({ data, error }) => {
      if (error) setAllowed(true); // offline: rely on cached session; database still enforces access
      else setAllowed((data ?? []).length > 0);
    });
  }, []);
  if (allowed === null) return <div className="p-10 text-muted-foreground">Laden…</div>;
  if (!allowed) return <NoAccess />;
  return (
    <PosProvider>
      <Shell />
    </PosProvider>
  );
}

function NoAccess() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded-2xl border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Geen toegang</h1>
        <p className="text-muted-foreground">Dit account heeft geen toegang tot de winkelgegevens. Log in met het winkelaccount van Anouk Fashion.</p>
        <Button onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }}>Uitloggen</Button>
      </div>
    </div>
  );
}

function Shell() {
  const pos = usePos();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [pickOpen, setPickOpen] = useState(false);
  const [displayBlocked, setDisplayBlocked] = useState(false);

  useEffect(() => {
    if (!customerDisplayEnabled()) return;
    void openCustomerDisplay().then((result) => setDisplayBlocked(result === "blocked"));
  }, []);

  useEffect(() => {
    if (!pos.loading && !pos.employee) setPickOpen(true);
  }, [pos.loading, pos.employee]);

  async function logout() {
    if (pos.pending > 0 && !confirm(`Er zijn ${pos.pending} verkopen nog niet gesynchroniseerd. Ze blijven op dit apparaat bewaard. Toch uitloggen?`)) return;
    publishDisplay(welcomeDisplay());
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const current = nav.find((n) => path.startsWith(n.to));
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="pos-header flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary px-3 py-2 text-primary-foreground">
          <Button asChild variant="ghost" className="mr-2 h-10 px-0 text-primary-foreground hover:bg-transparent hover:text-primary-foreground"><Link to="/kassa"><BrandLogo compact /><span className="text-xs text-primary-foreground/75">Kassa</span></Link></Button>
          <Button variant="outline" className="h-9 gap-2 border-primary-foreground/30 bg-primary text-sm text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" onClick={() => setPickOpen(true)}>
            <UserRound className="h-5 w-5" />
            {pos.employee ? pos.employee.name : "Kies medewerker"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 gap-2 border-primary-foreground/30 bg-primary text-sm text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"><Settings className="h-5 w-5" /> Instellingen</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {nav.filter((n) => n.to !== "/kassa").map((n) => (
                <DropdownMenuItem key={n.to} asChild className="h-11 gap-3 text-base">
                  <Link to={n.to}><n.icon className="h-5 w-5" />{n.label}</Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="h-11 gap-3 text-base"><LogOut className="h-5 w-5" />Uitloggen</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {pos.settings?.test_mode && <span className="rounded-md bg-warning px-2 py-1 text-sm font-semibold text-warning-foreground">TESTMODUS</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            {!pos.session && <span className="rounded-md bg-accent px-2 py-1 text-accent-foreground">Kassa gesloten</span>}
            {pos.session && new Date(pos.session.opened_at).toDateString() !== new Date().toDateString() && (
              <Link to="/dagafsluiting" className="flex items-center gap-1 rounded-md bg-warning px-2 py-1 text-warning-foreground">
                <AlertTriangle className="h-4 w-4" /> Sessie van {fmtDateTime(pos.session.opened_at)} nog open
              </Link>
            )}
            <span className={cn("flex items-center gap-1 font-medium", pos.online ? "text-primary-foreground" : "text-warning")}>
              {pos.online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {pos.online ? "Online" : "Offline"}
            </span>
            <Button variant="ghost" onClick={() => pos.runSync().then(() => toast.message("Synchronisatie uitgevoerd"))}
              className={cn("flex items-center gap-1 rounded-md px-2 py-1", pos.syncError ? "bg-destructive text-destructive-foreground" : pos.pending ? "bg-warning text-warning-foreground" : "text-primary-foreground/80")}
              title={pos.syncError ?? (pos.lastSync ? `Laatste synchronisatie ${fmtDateTime(pos.lastSync)}` : "Nog niet gesynchroniseerd")}>
              <RefreshCw className="h-4 w-4" />
              {pos.pending} te synchroniseren
              {pos.syncError && " · fout"}
            </Button>
            <span className="hidden text-primary-foreground/70 xl:inline">
              {pos.lastSync ? `Laatst: ${fmtDateTime(pos.lastSync)}` : ""}
            </span>
          </div>
        </header>
        {displayBlocked && <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-accent px-3 py-1 text-xs"><span>Klantenscherm geblokkeerd: sta pop-ups toe voor automatisch opstarten.</span><Button variant="ghost" size="sm" onClick={() => { void openCustomerDisplay(true).then((result) => setDisplayBlocked(result === "blocked")); }}>Klantenscherm openen</Button></div>}
        <main className="min-h-0 flex-1 overflow-auto">
          {path === "/kassa" ? <Outlet /> : <ManagementLayout><Outlet /></ManagementLayout>}
        </main>
      </div>
      <EmployeePicker open={pickOpen} onOpenChange={setPickOpen} />
      <OnScreenKeyboard />
    </div>
  );
}

function EmployeePicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const pos = usePos();
  const [pinFor, setPinFor] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [newName, setNewName] = useState("");
  const active = pos.employees.filter((e) => e.active);
  const requirePin = !!pos.settings?.require_pin;

  async function choose(e: Employee) {
    if (requirePin) {
      if (!e.has_pin) { toast.error("Voor deze medewerker is nog geen pincode ingesteld (Medewerkers)."); return; }
      setPinFor(e); setPin(""); return;
    }
    pos.setEmployee(e); onOpenChange(false);
  }
  async function verify() {
    if (!pinFor) return;
    const { data, error } = await supabase.rpc("verify_employee_pin", { _employee_id: pinFor.id, _pin: pin });
    if (error) { toast.error(pos.online ? error.message : "Pincode controleren kan alleen online"); return; }
    const r = data as { ok: boolean; error?: string };
    if (!r.ok) { toast.error(r.error ?? "Onjuiste pincode"); setPin(""); return; }
    pos.setEmployee(pinFor); setPinFor(null); onOpenChange(false);
  }
  async function addFirst() {
    if (!newName.trim()) return;
    const { error } = await supabase.from("employees").insert({ name: newName.trim() });
    if (error) return toast.error(error.message);
    setNewName(""); await pos.reload();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !pos.employee) return; onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="text-2xl">Wie werkt er?</DialogTitle></DialogHeader>
        {pinFor ? (
          <div className="space-y-4">
            <p>Pincode voor <b>{pinFor.name}</b></p>
            <Input autoFocus type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && verify()} className="h-14 text-center text-2xl tracking-widest" />
            <div className="flex gap-2">
              <Button variant="outline" className="h-12 flex-1" onClick={() => setPinFor(null)}>Terug</Button>
              <Button className="h-12 flex-1" onClick={verify}>Bevestigen</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {active.map((e) => (
                <Button key={e.id} variant={pos.employee?.id === e.id ? "default" : "outline"} className="h-20 text-lg" onClick={() => choose(e)}>
                  {e.name}
                </Button>
              ))}
            </div>
            {active.length === 0 && (
              <div className="space-y-2 rounded-xl border border-dashed p-4">
                <p className="text-sm text-muted-foreground">Nog geen medewerkers. Voeg de eerste toe:</p>
                <div className="flex gap-2">
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Naam" className="h-12" />
                  <Button className="h-12" onClick={addFirst}>Toevoegen</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
