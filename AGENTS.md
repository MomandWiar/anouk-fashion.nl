<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules (Anouk Fashion kassa)
- Money is always integer euro cents; never floats. Why: exact financial totals.
- Financial writes (sales, returns, gift cards, cash sessions, stock) go through Postgres RPC functions (`complete_sale`, `process_return`, `close_cash_session`, ...) that validate and run atomically; tables are read-only for the browser. Why: server-side validation and transactions.
- Sales and returns are idempotent on a client-generated UUID. Why: offline queue retries must never duplicate.
- Pricing/discount rules live in `src/lib/pos/pricing.ts` (pure, tested); the server re-checks line consistency. Why: one predictable source of discount logic.
- Offline data lives in IndexedDB (`src/lib/pos/local-db.ts`); a sale is stored there before success is shown. Why: durability during internet outages.
- Access requires a row in `user_roles` (first signup becomes owner); every RLS policy uses `is_shop()`. Why: the POS and data are never public.
- POS pages live under `src/routes/_authenticated/_pos/` and share `PosProvider`. Why: one shell with employee, connection and sync status.
- The register uses a category/catalog/receipt grid with responsive layout classes in `src/styles.css`; payment controls stay with the receipt total. Why: the checkout remains usable without changing transaction logic.
- Cash entry is a full-workspace view in the register; it feeds the existing payment confirmation and sale finalization. Why: switching the visual layout must not bypass durable checkout.
- Management pages share ManagementLayout; barcode camera decoding loads dynamically and stops media tracks on exit. Why: consistent navigation and no server-side camera imports or lingering camera access.
- tsconfig keeps `strict` but disables noUncheckedIndexedAccess/exactOptionalPropertyTypes. Why: pragmatic typing for large UI code.
- Customer display is a public, browser-local presentation route, with a whitelisted purchase snapshot delivered through same-origin localStorage/BroadcastChannel; it never fetches shop data or receives credentials. Why: connected screens need only the current purchase, not access to private POS data.
- Customer display enablement is device-local and startup respects popup/window-management permissions with an explicit recovery control. Why: browsers cannot silently grant access to physical displays.
- Cash drawer kick uses Web Serial from the browser and label printing uses the browser print window, both device-local settings. Why: no local print bridge is installed.
