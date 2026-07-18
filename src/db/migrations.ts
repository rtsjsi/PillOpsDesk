import type Database from 'better-sqlite3';

// Simple sequential migration runner using PRAGMA user_version.
const MIGRATIONS: string[] = [
  // v1: initial schema
  `
  CREATE TABLE IF NOT EXISTS medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    generic_name TEXT,
    manufacturer TEXT,
    hsn_code TEXT,
    gst_rate REAL NOT NULL DEFAULT 12,
    category TEXT,
    rack TEXT,
    reorder_level INTEGER NOT NULL DEFAULT 10,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name);

  CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    batch_no TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    mrp REAL NOT NULL DEFAULT 0,
    purchase_price REAL NOT NULL DEFAULT 0,
    sale_price REAL NOT NULL DEFAULT 0,
    quantity_in_stock INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_batches_medicine ON batches(medicine_id);
  CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date);

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    gstin TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    invoice_no TEXT,
    purchase_date TEXT NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    purchase_price REAL NOT NULL,
    gst_rate REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no TEXT NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    sale_date TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    cgst REAL NOT NULL DEFAULT 0,
    sgst REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL,
    medicine_id INTEGER REFERENCES medicines(id) ON DELETE SET NULL,
    medicine_name TEXT NOT NULL,
    batch_no TEXT,
    hsn_code TEXT,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    gst_rate REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS counters (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  );
  `,
  // v2: invoice-level discount percentage on sales
  `
  ALTER TABLE sales ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;
  `,
];

export function runMigrations(db: Database.Database): void {
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec(MIGRATIONS[v]);
    db.pragma(`user_version = ${v + 1}`);
  }
  seedDefaults(db);
}

function seedDefaults(db: Database.Database): void {
  const defaults: Record<string, string> = {
    store_name: 'My Pharmacy',
    address: '',
    phone: '',
    gstin: '',
    dl_no: '',
    invoice_prefix: 'INV',
    expiry_alert_days: '90',
  };
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(defaults)) insert.run(k, v);
    db.prepare('INSERT OR IGNORE INTO counters (key, value) VALUES (?, ?)').run(
      'invoice',
      0
    );
  });
  tx();
}
