import logo from "@/assets/anouk-logo.png.asset.json";
export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return <img src={logo.url} alt="Anouk Fashion" className={compact ? "anouk-logo anouk-logo-compact" : "anouk-logo"} />;
}