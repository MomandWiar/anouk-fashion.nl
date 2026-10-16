import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { cacheGet, cacheSet, metaGet, metaSet, queueAll } from "./local-db";
import { syncQueue } from "./sync";
import type { Promotion } from "./pricing";

export type Product = Tables<"products">;
export type Category = Tables<"categories">;
export type Employee = Tables<"employees">;
export type Settings = Tables<"shop_settings">;
export type CashSession = Tables<"cash_sessions">;

export const REGISTER_ID = "01";

type Catalog = { products: Product[]; categories: Category[]; promotions: Promotion[]; employees: Employee[]; settings: Settings | null };

type PosCtx = Catalog & {
  online: boolean;
  pending: number;
  syncError: string | null;
  lastSync: string | null;
  employee: Employee | null;
  setEmployee: (e: Employee | null) => void;
  session: CashSession | null;
  loading: boolean;
  reload: () => Promise<void>;
  reloadSession: () => Promise<void>;
  runSync: () => Promise<void>;
  refreshPending: () => Promise<void>;
};

const Ctx = createContext<PosCtx | null>(null);
export function usePos() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePos outside provider");
  return c;
}

export function PosProvider({ children }: { children: ReactNode }) {
  const [cat, setCat] = useState<Catalog>({ products: [], categories: [], promotions: [], employees: [], settings: null });
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [employee, setEmployeeState] = useState<Employee | null>(null);
  const [session, setSession] = useState<CashSession | null>(null);
  const [loading, setLoading] = useState(true);
  const onlineRef = useRef(true);

  const refreshPending = useCallback(async () => {
    const q = await queueAll();
    setPending(q.length);
    const err = q.find((x) => x.status === "error");
    setSyncError(err ? err.error ?? "Synchronisatiefout" : null);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [p, c, pr, e, s] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("promotions").select("*"),
        supabase.from("employees").select("*").order("name"),
        supabase.from("shop_settings").select("*").eq("id", 1).maybeSingle(),
      ]);
      const err = p.error || c.error || pr.error || e.error || s.error;
      if (err) throw err;
      const next: Catalog = {
        products: p.data ?? [], categories: c.data ?? [], promotions: (pr.data ?? []) as Promotion[],
        employees: e.data ?? [], settings: s.data ?? null,
      };
      setCat(next);
      await cacheSet("catalog", next);
    } catch {
      const cached = await cacheGet<Catalog>("catalog");
      if (cached) setCat(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadSession = useCallback(async () => {
    const { data, error } = await supabase.from("cash_sessions").select("*").eq("register_id", REGISTER_ID).eq("status", "open").maybeSingle();
    if (error) {
      const cached = await cacheGet<CashSession | null>("session");
      setSession(cached ?? null);
      return;
    }
    setSession(data ?? null);
    await cacheSet("session", data ?? null);
  }, []);

  const runSync = useCallback(async () => {
    const r = await syncQueue();
    if (r.synced > 0) {
      const now = new Date().toISOString();
      setLastSync(now);
      await metaSet("lastSync", now);
    }
    if (!r.networkDown && r.failed === 0) {
      const now = new Date().toISOString();
      setLastSync(now);
      await metaSet("lastSync", now);
    }
    await refreshPending();
  }, [refreshPending]);

  const setEmployee = useCallback((e: Employee | null) => {
    setEmployeeState(e);
    void metaSet("employee", e);
  }, []);

  useEffect(() => {
    void (async () => {
      setLastSync((await metaGet<string>("lastSync")) ?? null);
      const emp = await metaGet<Employee | null>("employee");
      if (emp) setEmployeeState(emp);
      await Promise.all([reload(), reloadSession(), refreshPending()]);
      void runSync();
    })();
  }, [reload, reloadSession, refreshPending, runSync]);

  // Connectivity: browser events + periodic probe against the backend
  useEffect(() => {
    const probe = async () => {
      let ok = navigator.onLine;
      if (ok) {
        try {
          const { error } = await supabase.from("registers").select("id").limit(1);
          ok = !error;
        } catch { ok = false; }
      }
      if (ok && !onlineRef.current) { void runSync(); void reload(); void reloadSession(); }
      onlineRef.current = ok;
      setOnline(ok);
    };
    const id = window.setInterval(probe, 15000);
    const on = () => void probe();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    void probe();
    return () => { window.clearInterval(id); window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, [runSync, reload, reloadSession]);

  // Warn before closing the tab with unsynced sales
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (pending > 0) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [pending]);

  const value = useMemo<PosCtx>(() => ({
    ...cat, online, pending, syncError, lastSync, employee, setEmployee, session, loading,
    reload, reloadSession, runSync, refreshPending,
  }), [cat, online, pending, syncError, lastSync, employee, setEmployee, session, loading, reload, reloadSession, runSync, refreshPending]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
