import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, Shirt, Maximize } from "lucide-react";
import { BrandLogo } from "@/components/pos/BrandLogo";
import { Button } from "@/components/ui/button";
import { euro } from "@/lib/pos/money";
import { readDisplay, subscribeDisplay, welcomeDisplay } from "@/lib/pos/customer-display";

export const Route = createFileRoute("/klantendisplay")({
  head: () => ({ meta: [{ title: "Klantenscherm · Anouk Fashion" }, { name: "description", content: "Uw aankoop bij Anouk Fashion." }, { property: "og:title", content: "Klantenscherm · Anouk Fashion" }, { property: "og:description", content: "Welkom bij Anouk Fashion." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CustomerDisplay,
});
const methodNames: Record<string, string> = { cash: "contant", pin: "pin", giftcard: "cadeaubon", exchange_credit: "ruiltegoed" };
function CustomerDisplay() {
  const [state, setState] = useState(welcomeDisplay);
  useEffect(() => { const update = () => setState(readDisplay()); update(); const unsubscribe = subscribeDisplay(update); const timer = setInterval(update, 5000); return () => { unsubscribe(); clearInterval(timer); }; }, []);
  return <main className="customer-display">
    <div className="display-hearts" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <Heart key={i} />)}</div>
    <header className="display-header"><BrandLogo compact={state.phase === "cart"} />{state.phase === "cart" && <span className="brand-script text-2xl">Leuk dat u er bent!<Heart className="ml-1 inline h-5 w-5 fill-brand-gold text-brand-gold" /></span>}</header>
    {state.phase === "welcome" ? <section className="display-welcome"><h1 className="brand-script">Welkom! <Heart className="inline fill-brand-gold text-brand-gold" /></h1><p className="display-eyebrow">Kijk rustig rond, wij helpen u graag</p><div className="display-categories">{["Kleding", "Schoenen", "Parfum", "Accessoires", "Cadeaus"].map((label) => <span key={label}>{label}</span>)}</div><p className="display-payment-note">U kunt betalen met pin, contant of cadeaubon</p></section>
      : state.phase === "complete" ? <section className="display-welcome"><h1 className="brand-script">Bedankt! <Heart className="inline fill-brand-gold text-brand-gold" /></h1><p className="display-eyebrow">Tot ziens bij Anouk Fashion</p><p className="text-muted-foreground">Betaald met {state.methods.map((method) => methodNames[method] ?? method).join(" en ")} · {euro(state.total_cents)}</p>{state.change_cents > 0 && <p className="mt-5 text-xl">Wisselgeld <strong className="tabular">{euro(state.change_cents)}</strong></p>}</section>
      : <div className="display-purchase"><section className="display-lines"><h1 className="brand-script mb-4 text-2xl">Uw winkelmand tot nu toe</h1><div className="display-line-scroll">{state.lines.map((line, i) => <div key={line.key} className={i === state.lines.length - 1 ? "display-line display-line-new" : "display-line"}><span className="display-shirt"><Shirt /></span><div className="min-w-0 flex-1"><strong>{line.description}</strong><div className="text-xs text-muted-foreground">{line.qty} × {euro(line.unit_cents)}{line.discount_cents > 0 && ` · korting −${euro(line.discount_cents)}`}</div></div><strong className="shrink-0 tabular">{euro(line.final_cents)}</strong></div>)}</div></section><aside className="display-total"><span className="display-eyebrow">Totaal</span><strong className="display-total-number tabular">{euro(state.total_cents)}</strong><span className="text-sm opacity-70">{state.lines.reduce((sum, line) => sum + line.qty, 0)} artikelen</span>{state.discount_cents > 0 && <span className="mt-4 text-sm">Korting {euro(state.discount_cents)}</span>}{state.paid_cents > 0 && <span className="mt-4 text-sm">Nog te betalen {euro(state.total_cents - state.paid_cents)}</span>}<div className="display-thanks"><Heart className="mx-auto mb-2 h-5 w-5 fill-brand-gold text-brand-gold" /><p className="brand-script text-xl">Bedankt dat u bij ons winkelt</p></div></aside></div>}
    <Button variant="ghost" size="icon" className="display-fullscreen" title="Volledig scherm" aria-label="Volledig scherm" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => {}); }}><Maximize /></Button>
  </main>;
}