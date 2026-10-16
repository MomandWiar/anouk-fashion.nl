import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Trash2, Pencil, PauseCircle, PlayCircle, Banknote, CreditCard, Gift, Percent, X, ScanLine, Printer, Split, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePos, type Product, REGISTER_ID } from "@/lib/pos/store";
import { priceCart, type CartDiscount, type CartLine, type StockMode } from "@/lib/pos/pricing";
import { amsDay, euro, parseEuro } from "@/lib/pos/money";
import { finalizeSale, giftCardCode, uuid, type PendingPayment } from "@/lib/pos/checkout";
import { metaGet, metaSet, type ReceiptSnapshot } from "@/lib/pos/local-db";
import { printReceipt, ReceiptView } from "@/components/pos/Receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { publishDisplay, welcomeDisplay, type DisplayState } from "@/lib/pos/customer-display";
import { drawerAutoEnabled, openDrawer } from "@/lib/pos/hardware";

export const Route = createFileRoute("/_authenticated/_pos/kassa")({
  head: () => ({ meta: [{ title: "Kassa · Anouk Fashion" }, { name: "description", content: "Afrekenen bij Anouk Fashion." }, { property: "og:title", content: "Kassa · Anouk Fashion" }, { property: "og:description", content: "Afrekenen bij Anouk Fashion." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: KassaPage,
});

type Cart = { saleId: string; lines: CartLine[]; payments: PendingPayment[]; cartDiscount: CartDiscount };
const emptyCart = (): Cart => ({ saleId: uuid(), lines: [], payments: [], cartDiscount: null });

/** Barcode scanner detection: fast key bursts ending with Enter. */
function useScanner(onScan: (code: string) => void) {
  const buf = useRef("");
  const last = useRef(0);
  const burst = useRef(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const now = performance.now();
      const fast = now - last.current < 35;
      last.current = now;
      const target = e.target as HTMLElement | null;
      const inScanField = target?.dataset?.scan === "1";
      if (inScanField) return; // the dedicated scan field handles its own Enter
      if (e.key === "Enter") {
        if (buf.current.length >= 4 && burst.current) {
          e.preventDefault();
          const code = buf.current;
          buf.current = ""; burst.current = false;
          onScan(code);
          return;
        }
        buf.current = ""; burst.current = false;
        return;
      }
      if (e.key.length !== 1) return;
      if (!fast) { buf.current = e.key; burst.current = false; return; }
      buf.current += e.key;
      if (buf.current.length >= 3) {
        burst.current = true;
        // keep scanner input out of whatever field is focused
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onScan]);
}

function KassaPage() {
  const pos = usePos();
  const navigate = useNavigate();
  const [cart, setCartState] = useState<Cart>(emptyCart);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [loose, setLoose] = useState<{ category_id: string | null; name: string } | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [payDlg, setPayDlg] = useState<null | "cash" | "pin" | "giftcard">(null);
  const [payDue, setPayDue] = useState<number | null>(null);
  const [splitDlg, setSplitDlg] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [looseAmt, setLooseAmt] = useState("");
  const [looseCat, setLooseCat] = useState<string | null>(null);
  const [cartDiscDlg, setCartDiscDlg] = useState(false);
  const [gcSellDlg, setGcSellDlg] = useState(false);
  const [parkedDlg, setParkedDlg] = useState(false);
  const [cancelDlg, setCancelDlg] = useState(false);
  const [done, setDone] = useState<{ snapshot: ReceiptSnapshot; change: number; queued: boolean } | null>(null);
  const finishing = useRef(false);
  const day = amsDay();

  // Persist the cart (incl. received partial payments) so a reload never loses payment status
  useEffect(() => { metaGet<Cart>("cart").then((c) => { if (c) setCartState(c); setLoaded(true); }); }, []);
  const setCart = useCallback((f: (c: Cart) => Cart) => {
    setCartState((c) => { const n = f(c); void metaSet("cart", n); return n; });
  }, []);

  const totals = useMemo(() => priceCart(cart.lines, pos.promotions, cart.cartDiscount, day), [cart.lines, cart.cartDiscount, pos.promotions, day]);
  const paid = cart.payments.reduce((a, p) => a + p.amount_cents, 0);
  const remaining = totals.total_cents - paid;

  useEffect(() => {
    if (!loaded) return;
    const state: DisplayState = done ? {
      ...welcomeDisplay(), phase: "complete", total_cents: done.snapshot.total_cents, change_cents: done.change,
      methods: [...new Set(done.snapshot.payments.map((payment) => payment.method))],
    } : {
      ...welcomeDisplay(), phase: totals.lines.length ? "cart" : "welcome",
      lines: totals.lines.map((line) => ({ key: line.key, description: [line.description, line.size, line.color].filter(Boolean).join(" · "), qty: line.qty, unit_cents: line.unit_price_cents, final_cents: line.final_cents, discount_cents: line.discount_cents })),
      total_cents: totals.total_cents, discount_cents: totals.discount_cents, paid_cents: paid,
    };
    const update = () => publishDisplay(state);
    update(); const timer = setInterval(update, 10000);
    window.addEventListener("anouk-display-settings", update);
    return () => { clearInterval(timer); window.removeEventListener("anouk-display-settings", update); };
  }, [loaded, totals, paid, done]);

  const catById = useMemo(() => new Map(pos.categories.map((c) => [c.id, c])), [pos.categories]);

  function stockModeFor(p: Product | null, category_id: string | null): StockMode {
    if (p?.track_stock) return "detailed";
    const c = category_id ? catById.get(category_id) : null;
    return c?.track_stock ? "category" : "none";
  }

  function addProduct(p: Product) {
    if (!p.active) { toast.error(`${p.name} is inactief`); return; }
    const mode = stockModeFor(p, p.category_id);
    const existing = cart.lines.find((l) => l.product_id === p.id && !l.price_overridden && !l.manual_discount);
    const inCart = cart.lines.filter((l) => l.product_id === p.id).reduce((a, l) => a + l.qty, 0);
    let oversold = false;
    const available = mode === "detailed" ? p.stock_qty : mode === "category" ? (catById.get(p.category_id!)?.stock_qty ?? 0) : Infinity;
    if (available - inCart - 1 < 0) {
      if (!confirm(`Voorraad ontoereikend voor ${p.name} (voorraad ${available}). Toch verkopen? Dit wordt vastgelegd.`)) return;
      oversold = true;
    }
    if (existing) {
      setCart((c) => ({ ...c, lines: c.lines.map((l) => (l.key === existing.key ? { ...l, qty: l.qty + 1, oversold: l.oversold || oversold } : l)) }));
    } else {
      setCart((c) => ({ ...c, lines: [...c.lines, {
        key: uuid(), kind: "product", product_id: p.id, category_id: p.category_id, description: p.name, size: p.size, color: p.color,
        qty: 1, unit_price_cents: p.price_cents, list_price_cents: p.price_cents, stock_mode: mode, cost_cents: p.cost_cents, oversold,
      }] }));
    }
    const lowAfter = mode === "detailed" && p.min_stock != null && p.stock_qty - inCart - 1 <= p.min_stock;
    if (lowAfter && !oversold) toast.warning(`Lage voorraad: ${p.name}`);
  }

  const handleScan = useCallback((code: string) => {
    if (cart.payments.length > 0) { toast.error("Er is al betaald; artikelen wijzigen kan niet meer."); return; }
    const p = pos.products.find((x) => x.barcode === code);
    if (p) { addProduct(p); return; }
    if (/^\d{12}$/.test(code) && code.startsWith(REGISTER_ID)) { navigate({ to: "/verkopen", search: { bon: code } }); return; }
    setUnknown(code);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.products, cart, navigate]);
  useScanner(handleScan);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return pos.products.filter((p) => p.active && (p.name.toLowerCase().includes(q) || p.barcode === q || (p.color ?? "").toLowerCase().includes(q))).slice(0, 30);
  }, [search, pos.products]);

  const locked = cart.payments.length > 0;
  const visibleProducts = search.trim().length >= 2
    ? results
    : pos.products.filter((p) => p.active && (!looseCat || p.category_id === looseCat));

  async function tryFinish(payments: PendingPayment[]) {
    const sum = payments.reduce((a, p) => a + p.amount_cents, 0);
    if (sum !== totals.total_cents || finishing.current) return;
    if (!pos.employee || !pos.session) return;
    finishing.current = true;
    try {
      const r = await finalizeSale({ sale_id: cart.saleId, online: pos.online, settings: pos.settings, session_id: pos.session.id, employee: pos.employee, totals, payments });
      const change = payments.filter((p) => p.method === "cash").reduce((a, p) => a + (p.change_cents ?? 0), 0);
      if (payments.some((p) => p.method === "cash") && drawerAutoEnabled()) void openDrawer().then((s) => { if (s === "error") toast.error("Lade openen mislukt"); });
      setDone({ snapshot: r.snapshot, change, queued: r.queued });
      setCart(() => emptyCart());
      await pos.refreshPending();
      if (!r.queued) void pos.reload();
      if (pos.settings?.auto_print) {
        const ok = await printReceipt(r.snapshot, pos.settings.paper_width, pos.settings.print_copies);
        if (!ok) toast.error("Printen mislukt. De verkoop is opgeslagen; u kunt de bon opnieuw printen.");
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Afronden mislukt");
    } finally {
      finishing.current = false;
    }
  }

  function addPayment(p: PendingPayment) {
    const next = [...cart.payments, p];
    setCart((c) => ({ ...c, payments: next }));
    if (next.reduce((a, x) => a + x.amount_cents, 0) === totals.total_cents) setConfirmOpen(true);
  }
  const dueNow = payDue != null ? Math.min(payDue, remaining) : remaining;
  function openPay(m: "cash" | "pin" | "giftcard") { setPayDue(null); setPayDlg(m); }
  function closePay() { setPayDlg(null); setPayDue(null); }
  const cashChange = cart.payments.filter((p) => p.method === "cash").reduce((a, p) => a + (p.change_cents ?? 0), 0);

  if (!loaded) return null;
  if (!pos.session) return <OpenSession />;

  const editing = cart.lines.find((l) => l.key === editKey) ?? null;

  const canPay = totals.lines.length > 0 && remaining > 0 && !!pos.employee;
  const looseCents = parseEuro(looseAmt) ?? 0;
  function addLoose() {
    if (locked) return toast.error("Er is al betaald; artikelen wijzigen kan niet meer.");
    if (looseCents <= 0) return toast.error("Vul eerst een bedrag in.");
    const cat = looseCat ? catById.get(looseCat) ?? null : null;
    const mode = stockModeFor(null, cat?.id ?? null);
    let oversold = false;
    if (mode === "category" && cat) {
      const inCart = cart.lines.filter((l) => l.category_id === cat.id && l.stock_mode === "category").reduce((a, l) => a + l.qty, 0);
      if (cat.stock_qty - inCart - 1 < 0) {
        if (!confirm(`Categorievoorraad ${cat.name} ontoereikend (${cat.stock_qty}). Toch verkopen?`)) return;
        oversold = true;
      }
    }
    setCart((c) => ({ ...c, lines: [...c.lines, { key: uuid(), kind: "loose", category_id: cat?.id ?? null, description: cat?.name ?? "Vrij bedrag", qty: 1, unit_price_cents: looseCents, list_price_cents: looseCents, stock_mode: mode, oversold }] }));
    setLooseAmt(""); setLooseCat(null);
  }

  return (
    <div className="pos-workspace flex h-full flex-col">
    {payDlg === "cash" && <CashScreen due={dueNow} lines={totals.lines} total={totals.total_cents} paid={paid} onClose={closePay} onPay={(tendered) => {
      const amount = Math.min(dueNow, tendered);
      addPayment({ id: uuid(), method: "cash", amount_cents: amount, tendered_cents: tendered, change_cents: tendered - amount });
      closePay();
    }} />}
    <div className={cn("pos-sales-grid min-h-0 flex-1", payDlg === "cash" && "hidden")}>
      <aside className="pos-categories" aria-label="Kledingcategorieën">
        <h2 className="pos-section-title">Categorieën</h2>
        <Button variant={!looseCat ? "default" : "ghost"} className="pos-category" disabled={locked} onClick={() => setLooseCat(null)}>Alle artikelen</Button>
        {pos.categories.filter((c) => c.active).map((c) => (
          <Button key={c.id} variant={looseCat === c.id ? "default" : "ghost"} disabled={locked}
            onClick={() => setLooseCat(c.id)} className="pos-category">{c.name}</Button>
        ))}
      </aside>
      <section className="pos-catalog" aria-label="Artikelen">
        <div className="relative shrink-0">
          <ScanLine className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
          <Input aria-label="Barcode of artikelnaam" data-scan="1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Barcode of artikelnaam"
            className="h-11 border-primary/40 bg-card pl-10 text-base"
            onKeyDown={(e) => {
              if (e.key === "Enter" && search.trim()) {
                const code = search.trim();
                const exact = pos.products.find((p) => p.barcode === code);
                if (exact) { handleScan(code); setSearch(""); }
                else if (results.length === 1) { addProduct(results[0]); setSearch(""); }
                else if (/^\d{6,}$/.test(code)) { handleScan(code); setSearch(""); }
              }
            }} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{looseCat ? catById.get(looseCat)?.name : "Alle artikelen"}</h2>
          <span className="text-xs text-muted-foreground">{visibleProducts.length} artikelen</span>
        </div>
        <div className="pos-product-area">
          <div className="pos-product-grid">
            {visibleProducts.map((p) => (
              <Button key={p.id} variant="outline" disabled={locked} onClick={() => { addProduct(p); setSearch(""); }} className="pos-product">
                <span className="font-semibold">{p.name}</span>
                <span className="text-xs text-muted-foreground">{[p.size, p.color].filter(Boolean).join(" · ")}</span>
                <span className="mt-auto flex w-full flex-wrap items-center justify-between gap-1">
                  <span className="font-semibold text-primary tabular">{euro(p.price_cents)}</span>
                  {p.track_stock && <span className="text-xs text-muted-foreground">{p.stock_qty} op voorraad</span>}
                </span>
              </Button>
            ))}
            <Button variant="outline" className="pos-product pos-add-product" aria-label="Artikel toevoegen" title="Artikel toevoegen" disabled={!pos.online} onClick={() => navigate({ to: "/producten", search: { nieuw: "" } })}><Plus className="h-8 w-8" /><span>Artikel toevoegen</span></Button>
          </div>
          {visibleProducts.length === 0 && <p className="py-4 text-sm text-muted-foreground">{search ? "Geen artikelen gevonden." : "Geen vaste artikelen in deze categorie."}</p>}
        </div>
        <div className="pos-loose-entry">
          <div className="pos-amount-panel">
            <Label htmlFor="loose-amount" className="text-sm">Los bedrag{looseCat ? ` · ${catById.get(looseCat)?.name}` : ""}</Label>
            <Input id="loose-amount" aria-label="Los bedrag" inputMode="decimal" value={looseAmt}
              onChange={(e) => setLooseAmt(e.target.value)} placeholder="0,00" className="h-12 bg-card text-right text-2xl font-semibold tabular" />
            <Button className="h-12 w-full" disabled={locked || looseCents <= 0} onClick={addLoose}><Plus className="h-5 w-5" />Voeg toe</Button>
          </div>
          <Numpad compact value={looseAmt} onChange={(v) => setLooseAmt(v.replace(/[^\d,]/g, "").replace(/,(?=.*,)/g, "").replace(/(,\d{2}).+$/, "$1"))} />
        </div>
      </section>

      {/* right: receipt */}
      <section className="pos-receipt flex min-h-0 flex-col bg-card" aria-label="Huidige aankoop">
        <div className="flex items-center justify-between gap-2 bg-primary px-3 py-2 text-primary-foreground">
          <h2 className="text-base font-semibold">Huidige aankoop</h2>
          {cart.lines.length > 0 && (
            <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" onClick={() => (cart.payments.length ? setCancelDlg(true) : setCart(() => emptyCart()))}>
              <X className="mr-1 h-4 w-4" />Wis alles
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {totals.lines.length === 0 && <p className="p-6 text-center text-muted-foreground">Scan een artikel of kies een categorie.</p>}
          {totals.lines.map((l) => (
            <div key={l.key} className="border-b px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{l.qty > 1 && <span className="tabular">{l.qty}× </span>}{l.description}{l.size ? ` (${l.size})` : ""}</div>
                  <div className="text-sm text-muted-foreground">
                    {l.color ? `${l.color} · ` : ""}{euro(l.unit_price_cents)} p/st
                    {l.oversold && <span className="ml-1 text-destructive">· voorraad ontoereikend</span>}
                  </div>
                  {(l.discount_note || l.discount_cents > 0) && <div className="text-sm text-primary">{l.discount_note ?? "Korting"}{l.discount_cents > 0 && ` −${euro(l.discount_cents)}`}</div>}
                  {l.gift_card_code && <div className="text-sm text-muted-foreground">Code {l.gift_card_code}</div>}
                </div>
                <div className="text-right">
                  {l.discount_cents > 0 && <div className="text-sm text-muted-foreground line-through tabular">{euro(l.original_cents)}</div>}
                  <div className="text-lg font-semibold tabular">{euro(l.final_cents)}</div>
                </div>
              </div>
              {!locked && (
                <div className="mt-2 flex items-center gap-2">
                  {l.kind !== "giftcard" && (<>
                    <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Minder" onClick={() => setCart((c) => ({ ...c, lines: c.lines.map((x) => x.key === l.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x) }))}><Minus className="h-4 w-4" /></Button>
                    <span className="w-8 text-center text-lg font-semibold tabular">{l.qty}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Meer" onClick={() => setCart((c) => ({ ...c, lines: c.lines.map((x) => x.key === l.key ? { ...x, qty: x.qty + 1 } : x) }))}><Plus className="h-4 w-4" /></Button>
                    <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Prijs of korting" onClick={() => setEditKey(l.key)}><Pencil className="h-4 w-4" /></Button>
                  </>)}
                  <Button size="icon" variant="ghost" className="ml-auto h-8 w-8 text-destructive" aria-label="Verwijderen" onClick={() => setCart((c) => ({ ...c, lines: c.lines.filter((x) => x.key !== l.key) }))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="shrink-0 space-y-2 border-t p-3">
          <div className="flex justify-between text-sm text-muted-foreground"><span>Subtotaal</span><span className="tabular">{euro(totals.total_cents + totals.discount_cents)}</span></div>
          {totals.discount_cents > 0 && <div className="flex justify-between text-primary"><span>Korting</span><span className="tabular">−{euro(totals.discount_cents)}</span></div>}
          {cart.payments.length > 0 && (
            <div className="space-y-1 rounded-xl bg-muted p-3 text-sm">
              {cart.payments.map((p) => (
                <div key={p.id} className="flex justify-between"><span>{methodLabel(p)}</span><span className="tabular">{euro(p.amount_cents)}</span></div>
              ))}
              <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Nog te betalen</span><span className="tabular">{euro(remaining)}</span></div>
            </div>
          )}
          {remaining === 0 && totals.lines.length > 0 && <Button className="h-12 w-full text-lg" onClick={() => setConfirmOpen(true)}>Verkoop afronden</Button>}
          <div className="flex items-baseline justify-between gap-2 border-t pt-2">
            <span className="font-semibold">{cart.payments.length ? "Resterend" : "Totaal"}</span>
            <span data-testid="cart-total" className="font-display text-3xl font-bold tabular">{euro(cart.payments.length ? remaining : totals.total_cents)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-12 bg-success text-success-foreground hover:bg-success/90" disabled={!canPay} onClick={() => openPay("cash")}><Banknote />Contant</Button>
            <Button className="h-12" disabled={!canPay} onClick={() => openPay("pin")}><CreditCard />Pin</Button>
            <Button variant="outline" className="h-9 px-2 text-xs" disabled={!canPay || !pos.online || totals.giftcard_cents > 0} onClick={() => openPay("giftcard")}><Gift />Cadeaubon</Button>
            <Button variant="outline" className="h-9 px-2 text-xs" disabled={!canPay} onClick={() => setSplitDlg(true)}><Split />Gesplitst</Button>
          </div>
          {!pos.employee && <p className="text-center text-sm text-destructive">Kies eerst een medewerker.</p>}
          {!pos.online && <p className="text-center text-sm text-muted-foreground">Offline: contant en handmatig bevestigde pin mogelijk.</p>}
        </div>
      </section>
    </div>

      {/* bottom bar: actions, total, payment */}
      <footer className={cn("pos-action-bar flex shrink-0 flex-wrap items-center justify-center gap-2 bg-primary px-3 py-2 text-primary-foreground", payDlg === "cash" && "hidden")}>
        <Button variant="ghost" className="h-10 px-3 text-sm text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" disabled={locked || totals.lines.length === 0} onClick={() => setCartDiscDlg(true)}>
          <Percent className="mr-2 h-5 w-5" />Korting{cart.cartDiscount ? ` (${cart.cartDiscount.type === "percent" ? cart.cartDiscount.value + "%" : euro(cart.cartDiscount.value)})` : ""}
        </Button>
        <Button variant="ghost" className="h-10 px-3 text-sm text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" disabled={locked || cart.lines.length === 0 || !pos.online} onClick={async () => {
          const label = prompt("Naam/omschrijving voor geparkeerde bon (optioneel)") ?? "";
          const { error } = await supabase.from("parked_carts").insert({ label, employee_id: pos.employee?.id, cart: { lines: cart.lines, cartDiscount: cart.cartDiscount } as never });
          if (error) return toast.error(error.message);
          setCart(() => emptyCart()); toast.success("Verkoop gepauzeerd");
        }}><PauseCircle className="mr-2 h-5 w-5" />Pauzeer</Button>
        <Button variant="ghost" className="h-10 px-3 text-sm text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" onClick={async () => {
          const r = await openDrawer();
          if (r === "ok") { toast.success("Lade open"); void supabase.from("audit_log").insert({ action: "lade_geopend", employee_id: pos.employee?.id }); }
          else toast.error(r === "not_linked" ? "Lade niet gekoppeld — Instellingen → Bonprinter en kassalade" : "Lade openen mislukt");
        }}><Banknote className="mr-2 h-5 w-5" />Lade open</Button>
        <Button variant="ghost" className="h-10 px-3 text-sm text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" disabled={locked || !pos.online} onClick={() => setParkedDlg(true)}><PlayCircle className="mr-2 h-5 w-5" />Hervat</Button>
        <Button variant="ghost" className="h-10 px-3 text-sm text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" disabled={locked || !pos.online} onClick={() => setGcSellDlg(true)}><Gift className="mr-2 h-5 w-5" />Bon verkopen</Button>
      </footer>

      {loose && <LooseDialog cat={loose} onClose={() => setLoose(null)} onAdd={(d, qty, price) => {
        const mode = stockModeFor(null, loose.category_id);
        let oversold = false;
        if (mode === "category") {
          const c = catById.get(loose.category_id!)!;
          const inCart = cart.lines.filter((l) => l.category_id === c.id && l.stock_mode === "category").reduce((a, l) => a + l.qty, 0);
          if (c.stock_qty - inCart - qty < 0) {
            if (!confirm(`Categorievoorraad ${c.name} ontoereikend (${c.stock_qty}). Toch verkopen?`)) return;
            oversold = true;
          }
        }
        setCart((c) => ({ ...c, lines: [...c.lines, { key: uuid(), kind: "loose", category_id: loose.category_id, description: d || loose.name, qty, unit_price_cents: price, list_price_cents: price, stock_mode: mode, oversold }] }));
        setLoose(null);
      }} />}
      {editing && <EditLineDialog line={editing} onClose={() => setEditKey(null)} onSave={(l) => { setCart((c) => ({ ...c, lines: c.lines.map((x) => (x.key === l.key ? l : x)) })); setEditKey(null); }} />}
      {unknown && (
        <Dialog open onOpenChange={() => setUnknown(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Onbekende barcode</DialogTitle></DialogHeader>
            <p>Barcode <b className="font-mono">{unknown}</b> is niet gevonden. Er is niets toegevoegd.</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="h-12" onClick={() => { const c = unknown; setUnknown(null); navigate({ to: "/producten", search: { nieuw: c } }); }}>Product aanmaken</Button>
              <Button className="h-12" onClick={() => { setUnknown(null); setLoose({ category_id: pos.categories.find((c) => c.name === "Overig")?.id ?? null, name: "Overig" }); }}>Losse verkoop</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {payDlg === "pin" && <PinDialog due={dueNow} cartRef={cart.saleId} onClose={closePay} onPaid={(amt, attemptId) => {
        addPayment({ id: uuid(), method: "pin", amount_cents: amt, manual: true, attempt_id: attemptId });
        closePay();
      }} />}
      {payDlg === "giftcard" && <GiftPayDialog due={dueNow} usedCodes={cart.payments.filter((p) => p.gift_card_code).map((p) => p.gift_card_code!)} onClose={closePay} onPay={(code, amt) => {
        addPayment({ id: uuid(), method: "giftcard", amount_cents: amt, gift_card_code: code });
        closePay();
      }} />}
      {cartDiscDlg && <CartDiscountDialog current={cart.cartDiscount} onClose={() => setCartDiscDlg(false)} onSave={(d) => { setCart((c) => ({ ...c, cartDiscount: d })); setCartDiscDlg(false); }} />}
      {gcSellDlg && <GiftSellDialog onClose={() => setGcSellDlg(false)} onAdd={(amt) => {
        if (pos.settings?.giftcard_vat_mode === "unset") { toast.error("Stel eerst de btw-behandeling van cadeaubonnen in (Instellingen)."); return; }
        if (cart.payments.length) return;
        setCart((c) => ({ ...c, lines: [...c.lines, { key: uuid(), kind: "giftcard", description: "Cadeaubon", qty: 1, unit_price_cents: amt, list_price_cents: amt, stock_mode: "none", gift_card_code: giftCardCode() }] }));
        setGcSellDlg(false);
      }} />}
      {parkedDlg && <ParkedDialog onClose={() => setParkedDlg(false)} onResume={(c) => { setCart(() => ({ ...emptyCart(), lines: c.lines, cartDiscount: c.cartDiscount })); setParkedDlg(false); }} />}
      {cancelDlg && (
        <Dialog open onOpenChange={() => setCancelDlg(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Er is al gedeeltelijk betaald</DialogTitle></DialogHeader>
            <p>Ontvangen: <b>{euro(paid)}</b>. Hervat de betaling, of geef de ontvangen bedragen terug aan de klant en bevestig dat hieronder.</p>
            <ul className="text-sm">{cart.payments.map((p) => <li key={p.id}>• {p.method === "cash" ? "Contant" : p.method === "pin" ? "Pin" : "Cadeaubon"} {euro(p.amount_cents)}</li>)}</ul>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="h-12" onClick={() => setCancelDlg(false)}>Betaling hervatten</Button>
              <Button variant="destructive" className="h-12" onClick={async () => {
                const ids = cart.payments.filter((p) => p.attempt_id).map((p) => p.attempt_id!);
                if (ids.length && pos.online) await supabase.from("payment_attempts").update({ status: "teruggeboekt", updated_at: new Date().toISOString() }).in("id", ids);
                if (pos.online) await supabase.from("audit_log").insert({ action: "betaling_teruggeboekt", employee_id: pos.employee?.id, details: { payments: cart.payments } as never });
                setCart(() => emptyCart()); setCancelDlg(false); toast.success("Verkoop geannuleerd, betalingen teruggeboekt");
              }}>Bedragen teruggegeven, annuleren</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {confirmOpen && remaining === 0 && totals.lines.length > 0 && (
        <Dialog open onOpenChange={(o) => !o && setConfirmOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="text-2xl">Verkoop afronden?</DialogTitle></DialogHeader>
            <div className="space-y-1 rounded-xl bg-muted p-4">
              <div className="flex justify-between text-lg font-semibold"><span>Totaal</span><span className="tabular">{euro(totals.total_cents)}</span></div>
              {cart.payments.map((p) => (
                <div key={p.id} className="flex justify-between text-sm"><span>{methodLabel(p)}{p.method === "cash" && p.tendered_cents != null ? ` (ontvangen ${euro(p.tendered_cents)})` : ""}</span><span className="tabular">{euro(p.amount_cents)}</span></div>
              ))}
            </div>
            {cashChange > 0 && <div className="rounded-2xl bg-success p-4 text-center text-success-foreground"><div>Wisselgeld</div><div className="font-display text-4xl font-bold tabular">{euro(cashChange)}</div></div>}
            <DialogFooter className="gap-2">
              <Button variant="outline" className="h-12" onClick={() => setConfirmOpen(false)}>Terug</Button>
              <Button data-testid="confirm-sale" className="h-12 text-lg" disabled={busy} onClick={async () => { setBusy(true); await tryFinish(cart.payments); setBusy(false); setConfirmOpen(false); }}>{busy ? "Bezig…" : "Bevestigen en afronden"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {done && (
        <Dialog open onOpenChange={() => { /* blijft staan tot Nieuwe verkoop */ }}>
          <DialogContent className="max-w-lg [&>button]:hidden" onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader><DialogTitle className="flex items-center gap-2 text-2xl"><CheckCircle2 className="h-7 w-7 text-success" />Verkoop afgerond</DialogTitle></DialogHeader>
            <div className="rounded-2xl bg-success p-6 text-center text-success-foreground">
              <div className="text-lg">Wisselgeld</div>
              <div data-testid="change-amount" className="font-display text-6xl font-bold tabular">{euro(done.change)}</div>
            </div>
            <p className="text-sm text-muted-foreground">Bon {done.snapshot.receipt_number} · totaal {euro(done.snapshot.total_cents)}{done.queued && " · offline opgeslagen, wordt automatisch gesynchroniseerd"}{pos.settings?.auto_print ? " · bon naar printer gestuurd" : ""}</p>
            <div className="max-h-48 overflow-auto rounded-lg border"><ReceiptView r={done.snapshot} paperWidth={pos.settings?.paper_width ?? 80} /></div>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="h-12" onClick={async () => { const ok = await printReceipt(done.snapshot, pos.settings?.paper_width ?? 80, pos.settings?.print_copies ?? 1); if (!ok) toast.error("Printen mislukt"); }}><Printer className="mr-2 h-5 w-5" />Bon (opnieuw) printen</Button>
              <Button className="h-14 text-lg" onClick={() => setDone(null)}>Nieuwe verkoop</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {splitDlg && <SplitDialog due={remaining} onClose={() => setSplitDlg(false)} onChoose={(method, amt) => { setSplitDlg(false); setPayDue(amt); setPayDlg(method); }} giftDisabled={!pos.online || totals.giftcard_cents > 0} />}
    </div>
  );
}

function Numpad({ value, onChange, compact = false }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ",", "0", "⌫"];
  return (
    <div className={cn("pos-numpad grid grid-cols-3", compact ? "pos-numpad-compact gap-1" : "gap-2")}>
      {keys.map((k) => (
        <Button key={k} type="button" variant="outline" className={compact ? "h-14 px-2 text-2xl" : "h-20 text-3xl"} onClick={() => onChange(k === "⌫" ? value.slice(0, -1) : value + k)}>{k}</Button>
      ))}
    </div>
  );
}

function AmountField({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input autoFocus={autoFocus} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="h-14 text-right text-3xl font-semibold tabular" placeholder="0,00" />
    </div>
  );
}

function LooseDialog({ cat, onClose, onAdd }: { cat: { name: string }; onClose: () => void; onAdd: (desc: string, qty: number, price: number) => void }) {
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(1);
  const [desc, setDesc] = useState("");
  const cents = parseEuro(price);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-2xl">{cat.name}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (cents && cents > 0) onAdd(desc.trim(), qty, cents); }} className="space-y-3">
          <AmountField label="Prijs per stuk" value={price} onChange={setPrice} autoFocus />
          <Numpad value={price} onChange={setPrice} />
          <div className="flex items-center gap-2">
            <Label className="w-20">Aantal</Label>
            <Button type="button" size="icon" variant="outline" className="h-12 w-12" onClick={() => setQty(Math.max(1, qty - 1))}><Minus /></Button>
            <span className="w-10 text-center text-xl font-semibold">{qty}</span>
            <Button type="button" size="icon" variant="outline" className="h-12 w-12" onClick={() => setQty(qty + 1)}><Plus /></Button>
          </div>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={`Omschrijving (optioneel, standaard "${cat.name}")`} className="h-12" />
          <Button type="submit" className="h-14 w-full text-lg" disabled={!cents || cents <= 0}>Toevoegen {cents ? euro(cents * qty) : ""}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditLineDialog({ line, onClose, onSave }: { line: CartLine; onClose: () => void; onSave: (l: CartLine) => void }) {
  const [price, setPrice] = useState((line.unit_price_cents / 100).toFixed(2).replace(".", ","));
  const [desc, setDesc] = useState(line.description);
  const [dType, setDType] = useState<"amount" | "percent">(line.manual_discount?.type ?? "percent");
  const [dVal, setDVal] = useState(line.manual_discount ? (line.manual_discount.type === "amount" ? (line.manual_discount.value / 100).toFixed(2).replace(".", ",") : String(line.manual_discount.value)) : "");
  function save() {
    const p = parseEuro(price);
    if (p == null || p < 0) return toast.error("Ongeldige prijs");
    let md: CartLine["manual_discount"] = null;
    if (dVal.trim()) {
      const v = dType === "amount" ? parseEuro(dVal) : parseFloat(dVal.replace(",", "."));
      if (v == null || isNaN(v) || v < 0 || (dType === "percent" && v > 100)) return toast.error("Ongeldige korting");
      if (v > 0) md = { type: dType, value: v };
    }
    onSave({ ...line, description: desc || line.description, unit_price_cents: p, price_overridden: p !== line.list_price_cents, manual_discount: md });
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Regel aanpassen</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Omschrijving</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} className="h-12" /></div>
          <AmountField label={`Prijs per stuk (catalogus ${euro(line.list_price_cents)})`} value={price} onChange={setPrice} />
          <div className="space-y-1">
            <Label>Korting op deze regel</Label>
            <div className="flex gap-2">
              <Button type="button" variant={dType === "percent" ? "default" : "outline"} className="h-12" onClick={() => setDType("percent")}>%</Button>
              <Button type="button" variant={dType === "amount" ? "default" : "outline"} className="h-12" onClick={() => setDType("amount")}>€</Button>
              <Input value={dVal} onChange={(e) => setDVal(e.target.value)} inputMode="decimal" className="h-12 text-lg" placeholder={dType === "percent" ? "bijv. 20" : "bijv. 5,00"} />
            </div>
            <p className="text-xs text-muted-foreground">Een regel met handmatige korting of prijswijziging doet niet mee aan acties of bonkorting.</p>
          </div>
        </div>
        <DialogFooter><Button className="h-12 w-full" onClick={save}>Opslaan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CartDiscountDialog({ current, onClose, onSave }: { current: CartDiscount; onClose: () => void; onSave: (d: CartDiscount) => void }) {
  const [t, setT] = useState<"amount" | "percent">(current?.type ?? "percent");
  const [v, setV] = useState(current ? (current.type === "amount" ? (current.value / 100).toFixed(2).replace(".", ",") : String(current.value)) : "");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Korting op hele bon</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Button variant={t === "percent" ? "default" : "outline"} className="h-12" onClick={() => setT("percent")}>%</Button>
          <Button variant={t === "amount" ? "default" : "outline"} className="h-12" onClick={() => setT("amount")}>€</Button>
          <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" className="h-12 text-lg" />
        </div>
        <p className="text-xs text-muted-foreground">Wordt verdeeld over regels zonder andere korting of actie.</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onSave(null)}>Verwijderen</Button>
          <Button onClick={() => {
            const val = t === "amount" ? parseEuro(v) : parseFloat(v.replace(",", "."));
            if (val == null || isNaN(val) || val <= 0 || (t === "percent" && val > 100)) return toast.error("Ongeldige korting");
            onSave({ type: t, value: val });
          }}>Toepassen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CashScreen({ due, lines, total, paid, onClose, onPay }: { due: number; lines: { key: string; description: string; qty: number; final_cents: number; discount_cents: number }[]; total: number; paid: number; onClose: () => void; onPay: (tendered: number) => void }) {
  const [v, setV] = useState("");
  const cents = parseEuro(v) ?? 0;
  const short = cents < due;
  return <div className="pos-cash-screen">
    <aside className="pos-cash-receipt" aria-label="Aankoop bij contant betalen">
      <h2 className="mb-4 font-semibold">Huidige aankoop</h2>
      <div className="min-h-0 flex-1 overflow-auto">{lines.map((line) => <div key={line.key} className="flex justify-between gap-3 border-b py-3 text-sm"><div>{line.description}<span className="ml-2 text-muted-foreground">× {line.qty}</span>{line.discount_cents > 0 && <div className="text-primary">Korting −{euro(line.discount_cents)}</div>}</div><span className="whitespace-nowrap font-semibold tabular">{euro(line.final_cents)}</span></div>)}</div>
      {paid > 0 && <div className="flex justify-between py-2 text-sm text-muted-foreground"><span>Al betaald</span><span>{euro(paid)}</span></div>}
      <div className="mt-4 flex items-baseline justify-between gap-2"><span className="font-semibold">Totaal</span><b className="text-3xl tabular">{euro(total)}</b></div>
    </aside>
    <section className="pos-cash-payment" aria-label="Contant betalen">
      <h1 className="mb-4 text-xl font-semibold">Contant betalen</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-4"><Label htmlFor="cash-received" className="text-xs text-muted-foreground">Ontvangen</Label><Input id="cash-received" aria-label="Ontvangen bedrag" autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0,00" className="mt-1 h-12 border-0 bg-card text-right text-4xl md:text-4xl font-bold tabular shadow-none" /></div>
        <div data-testid={short ? "cash-short" : "cash-change"} className={cn("flex flex-col justify-between rounded-lg p-4", short ? "bg-warning/15 text-warning-foreground" : "bg-success/10 text-success")}><span className="text-xs">{short ? "Nog te betalen" : "Wisselgeld"}</span><b className="text-right text-4xl tabular">{euro(Math.abs(cents - due))}</b></div>
      </div>
      <div className="my-3 flex flex-wrap gap-2">{[due, 2000, 5000, 10000, 20000].filter((q, i, all) => all.indexOf(q) === i).map((q) => <Button key={q} variant="outline" className="rounded-full" onClick={() => setV((q / 100).toFixed(2).replace(".", ","))}>{q === due ? "Gepast" : euro(q)}</Button>)}</div>
      <div className="w-[228px] max-w-full"><Numpad value={v} onChange={(value) => setV(value.replace(/[^\d,]/g, "").replace(/,(?=.*,)/g, "").replace(/(,\d{2}).+$/, "$1"))} /></div>
      <div className="mt-auto flex flex-wrap justify-end gap-2 pt-6"><Button variant="outline" className="h-12 min-w-24" onClick={onClose}>Terug</Button><Button className="h-12 bg-success px-6 text-success-foreground hover:bg-success/90" disabled={cents <= 0 || parseEuro(v) == null} onClick={() => onPay(cents)}>{short ? "Deelbetaling ontvangen" : "Betaling voltooien"}</Button></div>
    </section>
  </div>;
}

function PinDialog({ due, cartRef, onClose, onPaid }: { due: number; cartRef: string; onClose: () => void; onPaid: (amt: number, attemptId?: string) => void }) {
  const pos = usePos();
  const [v, setV] = useState((due / 100).toFixed(2).replace(".", ","));
  const [step, setStep] = useState<"amount" | "confirm">("amount");
  const [attemptId] = useState(uuid);
  const cents = parseEuro(v);
  const autoAvailable = !!pos.settings?.pin_auto_enabled && !!pos.settings?.pin_provider;
  async function record(status: "wachten" | "geslaagd" | "geweigerd" | "geannuleerd") {
    if (!pos.online || !cents) return;
    await supabase.from("payment_attempts").upsert({ id: attemptId, cart_ref: cartRef, method: "pin", amount_cents: cents, status, employee_id: pos.employee?.id, note: "handmatig", updated_at: new Date().toISOString() });
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-2xl">Pin · te betalen {euro(due)}</DialogTitle></DialogHeader>
        {!autoAvailable && <p className="rounded-lg bg-muted p-2 text-sm">Automatische pinkoppeling: <b>niet geconfigureerd</b>. Voer het bedrag zelf in op de pinautomaat.</p>}
        {step === "amount" ? (
          <>
            <AmountField label="Pinbedrag (lager = gesplitste betaling)" value={v} onChange={setV} />
            <Button className="h-14 text-lg" disabled={!cents || cents <= 0 || cents > due} onClick={async () => { await record("wachten"); setStep("confirm"); }}>
              Bedrag staat op de pinautomaat
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-muted p-6 text-center">
              <div>Wacht op betaling op de pinautomaat</div>
              <div className="font-display text-4xl font-bold tabular">{euro(cents ?? 0)}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="destructive" className="h-14" onClick={async () => { await record("geweigerd"); toast.error("Pinbetaling niet geslaagd"); onClose(); }}>Geweigerd / geannuleerd</Button>
              <Button className="h-14 bg-success text-success-foreground hover:bg-success/90" onClick={async () => { await record("geslaagd"); onPaid(cents!, pos.online ? attemptId : undefined); }}>Betaling geslaagd</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GiftPayDialog({ due, usedCodes, onClose, onPay }: { due: number; usedCodes: string[]; onClose: () => void; onPay: (code: string, amt: number) => void }) {
  const [code, setCode] = useState("");
  const [card, setCard] = useState<{ code: string; balance_cents: number; status: string } | null>(null);
  async function lookup() {
    const { data, error } = await supabase.from("gift_cards").select("code, balance_cents, status").eq("code", code.trim()).maybeSingle();
    if (error) return toast.error(error.message);
    if (!data) return toast.error("Cadeaubon niet gevonden");
    setCard(data);
  }
  const amt = card ? Math.min(card.balance_cents, due) : 0;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-2xl">Betalen met cadeaubon</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Input data-scan="1" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && lookup()} placeholder="Scan of typ code" className="h-12 font-mono text-lg" />
          <Button className="h-12" onClick={lookup}>Zoeken</Button>
        </div>
        {card && (
          <div className="space-y-2 rounded-xl bg-muted p-4">
            <div>Saldo: <b>{euro(card.balance_cents)}</b> {card.status !== "active" && <span className="text-destructive">(geblokkeerd)</span>}</div>
            {usedCodes.includes(card.code) && <div className="text-destructive">Deze bon is al gebruikt in deze verkoop.</div>}
            {card.balance_cents < due && card.balance_cents > 0 && <div>Restant {euro(due - card.balance_cents)} daarna met contant of pin.</div>}
            <Button className="h-12 w-full" disabled={amt <= 0 || card.status !== "active" || usedCodes.includes(card.code)} onClick={() => onPay(card.code, amt)}>{euro(amt)} afboeken</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GiftSellDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (amt: number) => void }) {
  const [v, setV] = useState("");
  const c = parseEuro(v);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Cadeaubon verkopen</DialogTitle></DialogHeader>
        <AmountField label="Waarde" value={v} onChange={setV} autoFocus />
        <div className="grid grid-cols-4 gap-2">{[1000, 2500, 5000, 10000].map((q) => <Button key={q} variant="secondary" onClick={() => onAdd(q)}>{euro(q)}</Button>)}</div>
        <p className="text-xs text-muted-foreground">De bon wordt pas actief als de betaling is voltooid.</p>
        <Button className="h-12" disabled={!c || c <= 0} onClick={() => c && onAdd(c)}>Toevoegen</Button>
      </DialogContent>
    </Dialog>
  );
}

function ParkedDialog({ onClose, onResume }: { onClose: () => void; onResume: (c: { lines: CartLine[]; cartDiscount: CartDiscount }) => void }) {
  const [rows, setRows] = useState<{ id: string; label: string | null; created_at: string; cart: { lines: CartLine[]; cartDiscount: CartDiscount } }[]>([]);
  useEffect(() => {
    supabase.from("parked_carts").select("*").order("created_at").then(({ data }) => setRows((data ?? []) as never));
  }, []);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Geparkeerde winkelmanden</DialogTitle></DialogHeader>
        {rows.length === 0 && <p className="text-muted-foreground">Geen geparkeerde winkelmanden.</p>}
        <div className="space-y-2">
          {rows.map((r) => (
            <button key={r.id} className={cn("w-full rounded-xl border p-3 text-left hover:border-primary")} onClick={async () => {
              const { error } = await supabase.from("parked_carts").delete().eq("id", r.id);
              if (error) return toast.error(error.message);
              onResume(r.cart);
            }}>
              <div className="font-medium">{r.label || "Zonder naam"}</div>
              <div className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam" })} · {r.cart.lines.length} artikelen</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OpenSession() {
  const pos = usePos();
  const [v, setV] = useState("");
  const c = parseEuro(v || "0");
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-8">
        <h1 className="text-2xl font-semibold">Kassa openen</h1>
        <p className="text-muted-foreground">Tel het startgeld in de kassalade. Verkopen kan pas na het openen.</p>
        <AmountField label="Startgeld" value={v} onChange={setV} autoFocus />
        <Button className="h-14 w-full text-lg" disabled={c == null || !pos.employee || !pos.online} onClick={async () => {
          const { error } = await supabase.rpc("open_cash_session", { _register_id: REGISTER_ID, _employee_id: pos.employee!.id, _start_cents: c! });
          if (error) return toast.error(error.message);
          await pos.reloadSession(); toast.success("Kassa geopend");
        }}>Kassa openen</Button>
        {!pos.employee && <p className="text-sm text-destructive">Kies eerst een medewerker.</p>}
        {!pos.online && <p className="text-sm text-destructive">Openen van de kassa vereist een internetverbinding.</p>}
      </div>
    </div>
  );
}

function methodLabel(p: PendingPayment): string {
  return { cash: "Contant", pin: p.manual ? "Pin (handmatig bevestigd)" : "Pin", giftcard: `Cadeaubon ${p.gift_card_code ?? ""}`, exchange_credit: "Ruiltegoed" }[p.method];
}

function SplitDialog({ due, onClose, onChoose, giftDisabled }: { due: number; onClose: () => void; onChoose: (m: "cash" | "pin" | "giftcard", amt: number) => void; giftDisabled: boolean }) {
  const [v, setV] = useState("");
  const cents = parseEuro(v) ?? 0;
  const ok = cents > 0 && cents <= due;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-2xl">Gesplitst betalen · nog {euro(due)}</DialogTitle></DialogHeader>
        <AmountField label="Bedrag voor dit deel" value={v} onChange={setV} autoFocus />
        <Numpad value={v} onChange={setV} />
        {cents > due && <p className="text-sm text-destructive">Hoger dan het resterende bedrag.</p>}
        {ok && <p className="text-sm text-muted-foreground">Daarna nog {euro(due - cents)} te betalen.</p>}
        <div className="grid grid-cols-3 gap-2">
          <Button className="h-14" disabled={!ok} onClick={() => onChoose("cash", cents)}><Banknote className="mr-1 h-5 w-5" />Contant</Button>
          <Button className="h-14" disabled={!ok} onClick={() => onChoose("pin", cents)}><CreditCard className="mr-1 h-5 w-5" />Pin</Button>
          <Button variant="secondary" className="h-14" disabled={!ok || giftDisabled} onClick={() => onChoose("giftcard", cents)}><Gift className="mr-1 h-5 w-5" />Bon</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
