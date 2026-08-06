import type Database from 'better-sqlite3';
import { seedAnetaMedicines } from './seed-aneta-medicines';

type Migration = string | ((db: Database.Database) => void);

// Simple sequential migration runner using PRAGMA user_version.
const MIGRATIONS: Migration[] = [
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
  // v3: medicine master — pack size, drug schedule, storage type
  `
  ALTER TABLE medicines ADD COLUMN pack_size TEXT;
  ALTER TABLE medicines ADD COLUMN schedule TEXT;
  ALTER TABLE medicines ADD COLUMN storage_type TEXT;
  `,
  // v4: split former free-text category (Tablet/Capsule/…) into dosage_form;
  // category becomes therapeutic class (Anti-Diabetic, Cardiovascular, …)
  `
  ALTER TABLE medicines RENAME COLUMN category TO dosage_form;
  ALTER TABLE medicines ADD COLUMN category TEXT;
  `,
  // v5: purchase line discount, free qty, taxable value, line total
  `
  ALTER TABLE purchase_items ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;
  ALTER TABLE purchase_items ADD COLUMN free_quantity INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE purchase_items ADD COLUMN taxable_value REAL NOT NULL DEFAULT 0;
  ALTER TABLE purchase_items ADD COLUMN line_total REAL NOT NULL DEFAULT 0;
  `,
  // v6: sale line discount % and taxable value (discount applied per line, not on header)
  `
  ALTER TABLE sale_items ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;
  ALTER TABLE sale_items ADD COLUMN taxable_value REAL NOT NULL DEFAULT 0;
  `,
  // v7: set all item-master GST rates to 5%
  `
  UPDATE medicines SET gst_rate = 5;
  `,
  // v8: fill blank HSN codes for item master (India GST Chapter 30 / related)
  // Order: specific non-pharma and therapeutic classes first, then catch-all medicaments.
  `
  UPDATE medicines SET hsn_code = '40141010'
  WHERE (hsn_code IS NULL OR trim(hsn_code) = '')
    AND (
      lower(ifnull(dosage_form,'')) = 'condom'
      OR lower(name) LIKE '%condom%'
    );

  UPDATE medicines SET hsn_code = '38221990'
  WHERE (hsn_code IS NULL OR trim(hsn_code) = '')
    AND (
      lower(ifnull(dosage_form,'')) = 'kit'
      OR lower(name) LIKE '%pregnancy%'
      OR lower(name) LIKE '%hcg%'
    );

  UPDATE medicines SET hsn_code = '34011190'
  WHERE (hsn_code IS NULL OR trim(hsn_code) = '')
    AND (
      lower(ifnull(dosage_form,'')) = 'soap'
      OR lower(name) LIKE '%soap%'
      OR lower(name) LIKE '%body wash%'
      OR lower(name) LIKE '%shampoo%'
      OR lower(name) LIKE '%netawash%'
      OR lower(name) LIKE '%intimate wash%'
    );

  UPDATE medicines SET hsn_code = '38089199'
  WHERE (hsn_code IS NULL OR trim(hsn_code) = '')
    AND lower(name) LIKE '%mosquito%';

  UPDATE medicines SET hsn_code = '33049990'
  WHERE (hsn_code IS NULL OR trim(hsn_code) = '')
    AND (
      lower(name) LIKE '%moisturiser%'
      OR lower(name) LIKE '%moisturizer%'
      OR lower(name) LIKE '%lip cream%'
      OR lower(name) LIKE '%baby body wash%'
      OR lower(name) LIKE '%baby shampoo%'
    );

  UPDATE medicines SET hsn_code = '30045090'
  WHERE (hsn_code IS NULL OR trim(hsn_code) = '')
    AND (
      lower(ifnull(category,'')) LIKE '%hematinic%'
      OR lower(ifnull(category,'')) = 'nutrinex'
      OR lower(ifnull(generic_name,'')) LIKE '%vitamin%'
      OR lower(ifnull(generic_name,'')) LIKE '%multivitamin%'
      OR lower(ifnull(generic_name,'')) LIKE '%cholecalciferol%'
      OR lower(ifnull(generic_name,'')) LIKE '%methylcobalamin%'
      OR lower(ifnull(generic_name,'')) LIKE '%calcium carbonate%'
      OR lower(ifnull(generic_name,'')) LIKE '%ferrous%'
      OR lower(ifnull(generic_name,'')) LIKE '%omega-3%'
      OR lower(ifnull(generic_name,'')) LIKE '%ginseng%'
    );

  UPDATE medicines SET hsn_code = '30041090'
  WHERE (hsn_code IS NULL OR trim(hsn_code) = '')
    AND (
      lower(ifnull(generic_name,'')) LIKE '%amoxicillin%'
      OR lower(ifnull(generic_name,'')) LIKE '%amoxycillin%'
      OR lower(ifnull(generic_name,'')) LIKE '%cloxacillin%'
      OR lower(ifnull(generic_name,'')) LIKE '%penicillin%'
    );

  UPDATE medicines SET hsn_code = '30042099'
  WHERE (hsn_code IS NULL OR trim(hsn_code) = '')
    AND (
      lower(ifnull(category,'')) IN ('antibiotic', 'anti-infective', 'anti-fungal')
      OR lower(ifnull(generic_name,'')) LIKE '%azithromycin%'
      OR lower(ifnull(generic_name,'')) LIKE '%cef%'
      OR lower(ifnull(generic_name,'')) LIKE '%cephalexin%'
      OR lower(ifnull(generic_name,'')) LIKE '%ciprofloxacin%'
      OR lower(ifnull(generic_name,'')) LIKE '%ofloxacin%'
      OR lower(ifnull(generic_name,'')) LIKE '%levofloxacin%'
      OR lower(ifnull(generic_name,'')) LIKE '%linezolid%'
      OR lower(ifnull(generic_name,'')) LIKE '%gentamicin%'
      OR lower(ifnull(generic_name,'')) LIKE '%itraconazole%'
      OR lower(ifnull(generic_name,'')) LIKE '%ketoconazole%'
      OR lower(ifnull(generic_name,'')) LIKE '%clotrimazole%'
      OR lower(ifnull(generic_name,'')) LIKE '%terbinafine%'
      OR lower(ifnull(generic_name,'')) LIKE '%fusidic%'
      OR lower(ifnull(generic_name,'')) LIKE '%metronidazole%'
      OR lower(ifnull(generic_name,'')) LIKE '%ornidazole%'
      OR lower(ifnull(generic_name,'')) LIKE '%fluconazole%'
    );

  UPDATE medicines SET hsn_code = '30043200'
  WHERE (hsn_code IS NULL OR trim(hsn_code) = '')
    AND (
      lower(ifnull(generic_name,'')) LIKE '%dexamethasone%'
      OR lower(ifnull(generic_name,'')) LIKE '%prednisolone%'
      OR lower(ifnull(generic_name,'')) LIKE '%methylprednisolone%'
      OR lower(ifnull(generic_name,'')) LIKE '%deflazacort%'
      OR lower(ifnull(generic_name,'')) LIKE '%triamcinolone%'
      OR lower(ifnull(generic_name,'')) LIKE '%beclomethasone%'
      OR lower(ifnull(generic_name,'')) LIKE '%clobetasol%'
      OR lower(ifnull(generic_name,'')) LIKE '%hydrocortisone%'
      OR lower(ifnull(generic_name,'')) LIKE '%norethisterone%'
    );

  UPDATE medicines SET hsn_code = '30049099'
  WHERE hsn_code IS NULL OR trim(hsn_code) = '';
  `,
  // v9: richer sale line snapshots for Metro-style invoices
  `
  ALTER TABLE sale_items ADD COLUMN free_quantity INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sale_items ADD COLUMN scheme TEXT;
  ALTER TABLE sale_items ADD COLUMN mrp REAL NOT NULL DEFAULT 0;
  ALTER TABLE sale_items ADD COLUMN expiry_date TEXT;
  ALTER TABLE sale_items ADD COLUMN manufacturer TEXT;
  ALTER TABLE sale_items ADD COLUMN pack_size TEXT;
  ALTER TABLE sale_items ADD COLUMN rack TEXT;
  `,
  // v10: customer GSTIN
  `
  ALTER TABLE customers ADD COLUMN gstin TEXT;
  `,
  // v11: seed Aneta / shared medicine master for client installs (idempotent)
  (db) => {
    seedAnetaMedicines(db);
  },
  // v12: normalize batch/sale expiry to last day of month (month+year only)
  `
  UPDATE batches
  SET expiry_date = date(expiry_date, 'start of month', '+1 month', '-1 day')
  WHERE expiry_date IS NOT NULL
    AND length(expiry_date) >= 7
    AND expiry_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]*';

  UPDATE sale_items
  SET expiry_date = date(expiry_date, 'start of month', '+1 month', '-1 day')
  WHERE expiry_date IS NOT NULL
    AND length(expiry_date) >= 7
    AND expiry_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]*';
  `,
  // v13: PAN card on store settings (key/value), suppliers, customers
  `
  ALTER TABLE suppliers ADD COLUMN pan TEXT;
  ALTER TABLE customers ADD COLUMN pan TEXT;
  `,
  // v14: drug licence number on suppliers and customers
  `
  ALTER TABLE suppliers ADD COLUMN dl_no TEXT;
  ALTER TABLE customers ADD COLUMN dl_no TEXT;
  `,
  // v15: payments against sales invoices
  `
  CREATE TABLE IF NOT EXISTS sale_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    paid_at TEXT NOT NULL,
    reference TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);
  `,
  // v16: persist purchase-line margin % (avoid reverse-calc drift from rounded sale)
  `
  ALTER TABLE purchase_items ADD COLUMN margin_percent REAL NOT NULL DEFAULT 0;

  UPDATE purchase_items
  SET margin_percent = ROUND(
    CASE
      WHEN (purchase_price * (1.0 - IFNULL(discount_percent, 0) / 100.0)) <= 0 THEN 0
      ELSE (
        (
          (SELECT sale_price FROM batches WHERE id = purchase_items.batch_id)
          - (purchase_price * (1.0 - IFNULL(discount_percent, 0) / 100.0))
        )
        / (purchase_price * (1.0 - IFNULL(discount_percent, 0) / 100.0))
      ) * 100.0
    END
  , 2)
  WHERE margin_percent = 0;
  `,
];

export function runMigrations(db: Database.Database): void {
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const step = MIGRATIONS[v];
    if (typeof step === 'function') {
      step(db);
    } else {
      db.exec(step);
    }
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
    pan: '',
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
