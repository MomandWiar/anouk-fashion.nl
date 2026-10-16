import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, Package, ScanLine, Receipt, Users, Settings, Wallet, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { to: "/rapportages", label: "Rapporten", icon: BarChart3 },
  { to: "/producten", label: "Artikelen", icon: Package },
  { to: "/artikel-scannen", label: "Artikel scannen en toevoegen", icon: ScanLine },
  { to: "/verkopen", label: "Betalingen en bonnen", icon: Receipt },
  { to: "/medewerkers", label: "Gebruikers", icon: Users },
  { to: "/instellingen", label: "Printer en terminal", icon: Settings },
] as const;

export function ManagementLayout({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return <div className="pos-management">
    <aside className="pos-management-nav" aria-label="Beheer">
      {links.map(({ to, label, icon: Icon }) => <Button key={to} asChild variant="ghost" className={cn("h-auto min-h-10 w-full justify-start whitespace-normal px-3 py-2 text-left", path === to && "bg-accent text-accent-foreground")}><Link to={to}><Icon className="shrink-0" />{label}</Link></Button>)}
      <div className="mt-3 border-t pt-3"><Button asChild variant="ghost" className="w-full justify-start"><Link to="/kassa"><ShoppingBag />Kassa</Link></Button></div>
    </aside>
    <div className="min-w-0">
      <nav className="pos-management-shortcuts" aria-label="Overzichten">
        <Button asChild variant="outline"><Link to="/rapportages"><BarChart3 />Dagomzet</Link></Button>
        <Button asChild variant="outline"><Link to="/verkopen" search={{ bon: undefined }}><Receipt />Verkochte artikelen</Link></Button>
        <Button asChild variant="outline"><Link to="/producten" search={{ nieuw: undefined }}><Package />Voorraad</Link></Button>
        <Button asChild variant="outline"><Link to="/dagafsluiting"><Wallet />Kassa-afsluiting</Link></Button>
      </nav>
      {children}
    </div>
  </div>;
}