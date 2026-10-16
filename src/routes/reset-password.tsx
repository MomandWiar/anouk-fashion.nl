import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nieuw wachtwoord · Anouk Fashion Kassa" },
      { name: "description", content: "Stel een nieuw wachtwoord in voor de kassa van Anouk Fashion." },
      { property: "og:title", content: "Nieuw wachtwoord · Anouk Fashion Kassa" },
      { property: "og:description", content: "Wachtwoord opnieuw instellen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Wachtwoord gewijzigd");
    navigate({ to: "/kassa", replace: true });
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-8">
        <h1 className="text-center text-2xl font-semibold">Nieuw wachtwoord</h1>
        <div className="space-y-2">
          <Label htmlFor="pw">Nieuw wachtwoord</Label>
          <Input id="pw" type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} className="h-12 text-base" />
        </div>
        <Button type="submit" disabled={busy} className="h-12 w-full text-base">Opslaan</Button>
      </form>
    </div>
  );
}
