/**
 * One-shot import of Aneta Pharma medicines into the local PillOpsDesk DB.
 *
 * Usage (from repo root):
 *   node scripts/import-aneta-medicines.cjs
 *
 * Creates %APPDATA%\PillOpsDesk\pharmacy.db if missing (full schema + seed settings),
 * then inserts medicines from data/aneta-pharma-medicines.json.
 * Skips names that already exist (case-insensitive).
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'aneta-pharma-medicines.json');
const DB_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'PillOpsDesk');
const DB_PATH = path.join(DB_DIR, 'pharmacy.db');

const MIGRATIONS = [
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
  `ALTER TABLE sales ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;`,
  `
  ALTER TABLE medicines ADD COLUMN pack_size TEXT;
  ALTER TABLE medicines ADD COLUMN schedule TEXT;
  ALTER TABLE medicines ADD COLUMN storage_type TEXT;
  `,
  `
  ALTER TABLE medicines RENAME COLUMN category TO dosage_form;
  ALTER TABLE medicines ADD COLUMN category TEXT;
  `,
];

function runMigrations(db) {
  const current = db.pragma('user_version', { simple: true }) ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec(MIGRATIONS[v]);
    db.pragma(`user_version = ${v + 1}`);
  }
  const defaults = {
    store_name: 'My Pharmacy',
    address: '',
    phone: '',
    gstin: '',
    dl_no: '',
    invoice_prefix: 'INV',
    expiry_alert_days: '90',
  };
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(defaults)) insert.run(k, v);
    db.prepare('INSERT OR IGNORE INTO counters (key, value) VALUES (?, ?)').run('invoice', 0);
  });
  tx();
}

function dosageFormFromPack(pack) {
  if (!pack) return null;
  const p = String(pack).toLowerCase();
  if (/\btab\b/.test(p)) return 'Tablet';
  if (/\bcap\b/.test(p)) return 'Capsule';
  if (/ampoule|vial|pfs|wfi/.test(p)) return 'Injection';
  if (/tube|cream|ointment|lami/.test(p)) return 'Cream';
  if (/syrup|suspension/.test(p)) return 'Syrup';
  if (/drop/.test(p)) return 'Drops';
  if (/bottle|\bml\b|\bg\b|jar/.test(p)) return 'Liquid';
  return null;
}

function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`Missing ${JSON_PATH}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const manufacturer = data.manufacturer || 'Aneta Pharmaceuticals Pvt. Ltd.';
  const medicines = data.medicines || [];
  if (!medicines.length) {
    console.error('No medicines in JSON.');
    process.exit(1);
  }

  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);

  const exists = db.prepare(
    'SELECT id FROM medicines WHERE lower(name) = lower(?) AND is_active = 1 LIMIT 1'
  );
  const insert = db.prepare(`
    INSERT INTO medicines
      (name, generic_name, manufacturer, hsn_code, gst_rate, dosage_form, category,
       pack_size, schedule, storage_type, rack, reorder_level, is_active)
    VALUES
      (@name, @generic_name, @manufacturer, NULL, @gst_rate, @dosage_form, @category,
       @pack_size, @schedule, NULL, NULL, 10, 1)
  `);

  let inserted = 0;
  let skipped = 0;
  const importTx = db.transaction(() => {
    for (const m of medicines) {
      const name = (m.brand_name || '').trim();
      if (!name) {
        skipped += 1;
        continue;
      }
      if (exists.get(name)) {
        skipped += 1;
        continue;
      }
      const category = m.category || null;
      insert.run({
        name,
        generic_name: m.composition || null,
        manufacturer,
        gst_rate: 12,
        dosage_form: dosageFormFromPack(m.pack),
        category,
        pack_size: m.pack || null,
        schedule: category === 'OTC Range' ? 'OTC' : null,
      });
      inserted += 1;
    }
  });
  importTx();

  const total = db.prepare('SELECT COUNT(*) AS c FROM medicines WHERE is_active = 1').get().c;
  db.close();

  console.log(`DB: ${DB_PATH}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped (duplicate/empty): ${skipped}`);
  console.log(`Active medicines now: ${total}`);
}

main();
