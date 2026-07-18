# PillOpsDesk (Offline Desktop App)

A fully offline Windows desktop application for a small-town pharmacy / medical store.
Built with **Electron + React + TypeScript** and a local **SQLite** database
(`better-sqlite3`). All data stays on the store PC — no internet required.

Designed for India: GST-aware billing (CGST + SGST), rupee currency, and
batch + expiry tracking.

## Features

- **Billing / POS** — fast search-and-add (barcode-scanner friendly), automatic
  GST split, per-line and overall discounts, walk-in or saved customers,
  sequential invoice numbers, and print / PDF invoices.
- **Inventory** — medicines with salt, manufacturer, HSN, GST rate, rack location
  and reorder level; multiple **batches** per medicine with expiry, MRP, purchase
  and sale prices, and stock quantity.
- **Purchases (stock inward)** — record supplier bills; stock is added to batches
  automatically (matching batches are merged).
- **Customers & Suppliers** — simple contact management, reused in bills/purchases.
- **Dashboard** — today's sales, low-stock, expiring-soon and expired alerts.
- **Reports** — sales, GST summary, low stock, expiring, and stock valuation, with
  one-click **CSV export**.
- **Settings** — store profile (used on invoices), invoice prefix, expiry alert
  window, PIN-based users (owner/staff), and one-click **database backup / restore**.

## Tech stack

| Layer     | Choice                                  |
| --------- | --------------------------------------- |
| Shell     | Electron (Forge + Vite)                 |
| UI        | React 18 + TypeScript + Tailwind CSS    |
| Database  | SQLite via `better-sqlite3` (WAL mode)  |
| IPC       | `contextBridge` + typed `ipcRenderer`   |

The database file lives in Electron's `userData` directory so it survives app
updates. All DB access happens in the main process behind a typed IPC layer —
the renderer never touches SQLite directly.

## Prerequisites

- **Node.js 20+** and npm.
- **Windows build tools** for compiling the native `better-sqlite3` module:
  install the "Desktop development with C++" workload from Visual Studio Build
  Tools, plus Python 3.x. (Prebuilt binaries are used when available, so a
  rebuild is often not needed.)

## Getting started (development)

```bash
npm install      # installs deps and rebuilds better-sqlite3 for Electron
npm start        # launches the app in development
```

On first launch you will be asked to create the **owner** account.

## Building the Windows installer

```bash
npm run make
```

The installer (`PillOpsDeskSetup.exe`) and packaged app are produced under
the `out/` directory.

## Project structure

```
src/
  main.ts               # Electron main process (window + lifecycle)
  preload.ts            # contextBridge API exposed to the renderer
  renderer.tsx          # React entry point
  shared/               # types + IPC contract shared by main & renderer
  db/
    index.ts            # SQLite connection (WAL, foreign keys)
    migrations.ts       # schema + seed data
    services/           # per-domain data access (medicines, sales, ...)
  ipc/
    register.ts         # wires IPC channels to services
    invoice.ts          # invoice HTML + print
    backup.ts           # backup / restore / CSV export
  renderer/
    App.tsx             # routing + auth
    components/         # Layout, Modal, UI primitives
    pages/              # Dashboard, Billing, Inventory, Reports, ...
```

## Notes

- GST is modelled as intra-state **CGST + SGST** (split evenly). Sale prices are
  treated as **MRP-inclusive** of GST, which is the common pharmacy convention.
- This is a single-machine, single-store app with no cloud sync. Use the backup
  feature regularly to protect your data.
