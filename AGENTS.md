# AGENTS.md — Project Context for PillOpsDesk (Offline Desktop App)

This file gives AI agents and IDEs the full working context for this repository.
It is intentionally detailed so any tool can be productive immediately and avoid
common pitfalls. Keep it up to date when architecture or conventions change.

## 1. What this project is

A **fully offline Windows desktop application** for a small-town pharmacy /
medical store in **India**. All data is stored locally in SQLite — no network,
no cloud, no external services. Currency is **INR (₹)**; sales are **GST-aware**
(CGST + SGST split evenly).

Primary users: pharmacy owner and staff, operating a single store on a single PC.

## 2. Tech stack

| Layer     | Choice                                            |
| --------- | ------------------------------------------------- |
| Shell     | Electron (via **Electron Forge** + **Vite** plugin) |
| Language  | TypeScript (strict)                               |
| UI        | React 18, React Router (HashRouter)               |
| Styling   | Tailwind CSS (config in `tailwind.config.cjs`)    |
| Database  | SQLite via **better-sqlite3** (synchronous, WAL)  |
| IPC       | `contextBridge` + `ipcRenderer.invoke` (typed)    |
| Packaging | electron-forge `make` → Squirrel Windows installer |

Node 20+ required. `better-sqlite3` is a **native module** compiled against
Electron via `@electron/rebuild` (see gotchas).

## 3. Architecture (READ THIS FIRST)

Three Electron contexts, strictly separated:

```
Renderer (React)  --window.pharmacy-->  Preload (contextBridge)
      |                                        |
      | (never touches DB or Node directly)    | ipcRenderer.invoke
      v                                        v
                                        Main process
                                          |  registerIpc() wires channels
                                          v
                                   db/services/*  -->  SQLite (better-sqlite3)
```

Rules that MUST be preserved:

- **The renderer never accesses SQLite, `fs`, or Node APIs directly.** All data
  access goes through `window.pharmacy.*`, which is defined in
  `src/preload.ts` and typed by `src/shared/api.ts`.
- **All DB logic lives in the main process** under `src/db/services/`.
- The IPC contract is defined once in `src/shared/api.ts` (the `PharmacyApi`
  interface + the `IPC` channel-name constants). Adding a feature means editing
  this file plus the preload, the handler registration, and a service.

### Data flow to add a new backend operation

1. Add the method signature to `PharmacyApi` and a channel constant to `IPC` in
   [src/shared/api.ts](src/shared/api.ts).
2. Implement the logic in the relevant `src/db/services/*.ts`.
3. Register the channel in [src/ipc/register.ts](src/ipc/register.ts) via
   `handle(IPC.xxx, ...)`. **Annotate handler parameter types explicitly** —
   generic inference otherwise types them as `unknown` (see gotchas).
4. Expose it in [src/preload.ts](src/preload.ts) under `window.pharmacy`.
5. Call it from a renderer page/component.

## 4. Directory map

```
src/
  main.ts                 # Electron main: window creation + app lifecycle
  preload.ts              # contextBridge -> window.pharmacy (typed API)
  renderer.tsx            # React entry (HashRouter)
  shared/
    types.ts              # Domain types shared by main + renderer
    api.ts                # PharmacyApi contract + IPC channel constants
  db/
    index.ts              # SQLite connection (WAL, foreign_keys), userData path
    migrations.ts         # Schema + seed data; PRAGMA user_version migrations
    services/
      medicines.ts        # Medicine CRUD (soft-delete via is_active)
      batches.ts          # Batch CRUD + stock listing
      parties.ts          # Suppliers + Customers CRUD
      purchases.ts        # Stock inward; creates/merges batches (transaction)
      sales.ts            # Sales: sellable search, createSale, invoice numbering
      reports.ts          # Dashboard stats + report queries
      settings.ts         # Key/value settings get/save
      auth.ts             # PIN users (scrypt hash), login
  ipc/
    register.ts           # Wires every IPC channel to a service
    invoice.ts            # Builds invoice HTML + prints via hidden BrowserWindow
    backup.ts             # DB backup/restore + CSV export (uses dialog)
  renderer/
    App.tsx               # Routes + auth context (useAuth) + ToastProvider
    components/
      Layout.tsx          # Sidebar nav + outlet
      Modal.tsx           # Reusable modal
      ui.tsx              # Spinner, EmptyState, Badge, Toast system, errMsg()
    lib/format.ts         # inr(), formatDate(), daysUntil(), toCsv(), etc.
    pages/                # Dashboard, Inventory, Purchases, Sales,
                          # Customers, Suppliers, Reports, SettingsPage, LoginPage
    global.d.ts           # Declares window.pharmacy for the renderer
forge.config.ts           # Forge: makers, AutoUnpackNatives, Vite, Fuses
vite.main.config.ts       # Main build: @shared alias + externalize better-sqlite3
vite.preload.config.ts    # Preload build: @shared alias
vite.renderer.config.ts   # Renderer build: @shared alias + React plugin
tsconfig.json             # @shared/* path alias -> src/shared/*
```

## 5. Commands

```bash
npm install       # installs deps; postinstall rebuilds better-sqlite3 for Electron
npm start         # run the app in development (Vite dev server + Electron)
npm test          # unit tests (Vitest)
npm run test:e2e  # Playwright e2e (needs packaged app via npm run package)
npm run make      # build the Windows installer (out/make/.../PillOpsDeskSetup.exe)
npm run clean     # delete out/, .vite/, Playwright artifacts, e2e user-data
npm run rebuild   # manually rebuild better-sqlite3 against Electron if needed
npm run typecheck # TypeScript check (no emit; Vite/Forge does the actual build)
npm run icons     # regenerate app icons from assets/icons/icon.svg
```

`npm run lint` is an alias for `typecheck` (no ESLint config in this repo).

## 6. Data model (SQLite)

- `medicines` — name, generic_name, manufacturer, hsn_code, gst_rate,
  dosage_form (Tablet/Capsule/…), category (therapeutic class), pack_size,
  schedule, storage_type, rack, reorder_level, `is_active` (soft delete),
  created_at.
- `batches` — medicine_id (FK), batch_no, expiry_date (yyyy-mm-dd), mrp,
  purchase_price, sale_price, quantity_in_stock.
- `suppliers`, `customers` — contact info (supplier also has gstin).
- `purchases` + `purchase_items` — stock inward; increments batch stock.
- `sales` + `sale_items` — invoices; decrements batch stock. `invoice_no` unique.
- `users` — username, pin_hash, salt, role (`owner` | `staff`).
- `settings` — key/value store profile + preferences.
- `counters` — holds the incrementing `invoice` sequence.

Migrations: `src/db/migrations.ts` uses `PRAGMA user_version`. To change the
schema, **append a new SQL string** to the `MIGRATIONS` array (never edit an
existing migration in place) so existing installs upgrade cleanly.

## 7. Business rules / conventions

- **GST**: sale prices are treated as **MRP-inclusive** of GST. Taxable value =
  `gross / (1 + rate/100)`; tax is split evenly into CGST and SGST. This logic
  exists in both `db/services/sales.ts` (authoritative) and `pages/Sales.tsx`
  (for live display in New Sale / Edit Invoice) — keep them consistent.
- **Money**: store as REAL; round to 2 decimals with the `round2` helper in
  sales service. Format for display with `inr()` from `renderer/lib/format.ts`.
- **Dates**: expiry dates are `yyyy-mm-dd` strings; timestamps are ISO strings.
- **Deletes**: medicines are **soft-deleted** (`is_active = 0`) to preserve
  historical sale references. Batches/parties are hard-deleted.
- **Invoice numbers**: `<invoice_prefix>-<5-digit sequence>` from the `counters`
  table; prefix comes from settings.
- **Auth**: PINs hashed with Node `crypto.scryptSync` + per-user salt; verified
  with `timingSafeEqual`. First launch registers the `owner`. Session is kept in
  the renderer's `sessionStorage` only (per-launch).
- **Errors**: services `throw new Error(...)`; the renderer surfaces them with
  `errMsg()` + toast. Keep messages user-friendly (shown in the UI).

## 8. Gotchas / things that will bite you later

1. **PowerShell shell.** The dev environment uses PowerShell, which does NOT
   support `&&` chaining or bash heredocs (`<<'EOF'`). Run commands separately
   or use `;`. For git commit messages, write to a file and use `git commit -F`.
2. **`@shared` alias must be mirrored in every Vite config.** tsconfig defines
   the `@shared/*` path, but Vite needs its own `resolve.alias` in
   `vite.main.config.ts`, `vite.preload.config.ts`, AND `vite.renderer.config.ts`.
   Renderer files mostly use relative `../shared/...`; main/db/ipc use `@shared`.
3. **better-sqlite3 is native + must stay external in the main build.** It's
   listed in `rollupOptions.external` (vite.main.config.ts), kept in
   `dependencies` (not dev), rebuilt via the `postinstall` electron-rebuild, and
   unpacked from asar by `AutoUnpackNativesPlugin` in forge.config.ts. If you see
   "Cannot find module better-sqlite3" or ABI errors, run `npm run rebuild`.
4. **Config files are `.cjs` on purpose.** `postcss.config.cjs` and
   `tailwind.config.cjs` use CommonJS because `package.json` has no
   `"type": "module"` (Forge expects CommonJS). Do NOT add `"type": "module"` —
   it will break the toolchain. Do NOT rename these back to `.js` with ESM syntax.
5. **IPC handler params need explicit type annotations** in `ipc/register.ts`;
   otherwise the generic `handle<T>()` infers them as `unknown` and tsc fails.
6. **DB lives in `app.getPath('userData')`**, not the repo. `*.db` files are
   gitignored. Deleting the app does not delete the DB; use backup/restore.
7. **HashRouter** is used (not BrowserRouter) because the packaged app loads via
   `file://`. Keep it.
8. **Content-Security-Policy** is set in `index.html`. If you add external
   resources or inline scripts, update the CSP accordingly.

## 9. Repository

- Remote: `origin` → https://github.com/rtsjsi/PillOpsDesk.git
- Default branch: `main`.
- Only source + config are tracked; `node_modules/`, `out/`, `.vite/`, and
  `*.db*` are ignored.

## 10. When adding features — checklist

- [ ] Update `src/shared/types.ts` and `src/shared/api.ts` (contract first).
- [ ] Implement/extend a `src/db/services/*.ts` function.
- [ ] Register the channel in `src/ipc/register.ts` (typed params!).
- [ ] Expose it in `src/preload.ts`.
- [ ] Build the UI in a `src/renderer/pages/*` file; use existing `ui.tsx`
      primitives, `Modal`, and `format.ts` helpers for consistency.
- [ ] For schema changes, append a migration in `src/db/migrations.ts`.
- [ ] Run `npx tsc --noEmit` and `npm start` to verify.
