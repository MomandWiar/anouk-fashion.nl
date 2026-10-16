import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Inloggen winkelsessie · Anouk Fashion Kassa" },
      { name: "description", content: "Log in om de kassa van Anouk Fashion te openen." },
      { property: "og:title", content: "Inloggen · Anouk Fashion Kassa" },
      { property: "og:description", content: "Beveiligde winkelsessie voor de kassa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/kassa", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/kassa", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: `${window.location.origin}/kassa` },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/kassa", replace: true });
        else toast.success("Bevestig uw e-mailadres via de link in uw mailbox en log daarna in.");
      }
    } catch (err) {
      toast.error((err as Error).message === "Invalid login credentials" ? "Onjuist e-mailadres of wachtwoord" : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="text-center">
          <img src="/favicon.png" alt="" width={56} height={56} className="mx-auto mb-3 rounded-xl" />
          <h1 className="text-2xl font-semibold">Anouk Fashion</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "in" ? "Open de beveiligde winkelsessie" : "Eigenaarsaccount aanmaken"}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mailadres</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw">Wachtwoord</Label>
          <Input id="pw" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-base" />
        </div>
        <Button type="submit" disabled={busy} className="h-12 w-full text-base">
          {mode === "in" ? "Inloggen" : "Account aanmaken"}
        </Button>
        {mode === "in" && (
          <button type="button" onClick={async () => {
            if (!email) return toast.error("Vul eerst uw e-mailadres in");
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
            if (error) return toast.error(error.message);
            toast.success("Er is een e-mail gestuurd met een link om een nieuw wachtwoord in te stellen.");
          }} className="w-full text-center text-sm font-medium text-primary underline-offset-4 hover:underline">
            Wachtwoord vergeten?
          </button>
        )}
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
          {mode === "in" ? "Eerste keer? Eigenaarsaccount aanmaken" : "Ik heb al een account"}
        </button>
      </form>
    </div>
  );
}
