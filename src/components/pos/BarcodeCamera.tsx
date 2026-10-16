import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { ScanLine, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BarcodeCamera({ onScan }: { onScan: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const generation = useRef(0);
  const onScanRef = useRef(onScan);
  const [state, setState] = useState<"idle" | "starting" | "running">("idle");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  function stop() {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    const stream = video.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (video.current) video.current.srcObject = null;
    setState("idle");
  }
  useEffect(() => () => { generation.current++; controls.current?.stop(); }, []);
  async function start() {
    if (!video.current) return;
    const run = ++generation.current;
    setError(null); setState("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera niet beschikbaar. Gebruik een barcodescanner of voer de barcode in.");
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (run !== generation.current || !video.current) return;
      const reader = new BrowserMultiFormatReader();
      let lastCode = "";
      let lastAt = 0;
      const active = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video.current, (result) => {
        if (!result || run !== generation.current) return;
        const code = result.getText();
        if (code === lastCode && Date.now() - lastAt < 2500) return;
        lastCode = code; lastAt = Date.now();
        onScanRef.current(code);
      });
      if (run !== generation.current) { active.stop(); return; }
      controls.current = active; setState("running");
    } catch (e) {
      if (run !== generation.current) return;
      setState("idle");
      const name = e instanceof Error ? e.name : "";
      setError(name === "NotAllowedError" ? "Cameratoegang geweigerd. Geef toestemming of voer de barcode in." : name === "NotFoundError" ? "Geen camera gevonden. Gebruik een barcodescanner of voer de barcode in." : e instanceof Error ? e.message : "Camera starten mislukt.");
    }
  }
  return <div className="flex min-w-0 flex-col gap-2">
    <div className="pos-camera">
      <video ref={video} muted playsInline className={state === "running" ? "h-full w-full object-cover" : "hidden"} />
      {state !== "running" && <ScanLine className="h-9 w-9 text-primary" />}
      {state === "running" && <div className="pos-camera-target" aria-hidden="true" />}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button className="h-11" variant={state === "running" ? "outline" : "default"} disabled={state === "starting"} onClick={state === "running" ? stop : start}>{state === "running" ? <><CameraOff />Stop scan</> : <><ScanLine />{state === "starting" ? "Camera starten…" : "Start scan"}</>}</Button>
  </div>;
}