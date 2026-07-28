/**
 * Build src/db/seed-aneta-medicines.ts from the local PillOpsDesk DB
 * (unique active medicines by case-insensitive name).
 *
 * Run: set ELECTRON_RUN_AS_NODE=1 && node_modules\electron\dist\electron.exe scripts/generate-aneta-seed-from-db.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');

const dbPath = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'PillOpsDesk',
  'pharmacy.db'
);
if (!fs.existsSync(dbPath)) {
  throw new Error(`DB not found: ${dbPath}`);
}

const db = new Database(dbPath, { readonly: true });
const rows = db
  .prepare(
    `SELECT name, generic_name, manufacturer, hsn_code, gst_rate, dosage_form, category,
            pack_size, schedule, storage_type, rack, reorder_level
     FROM medicines
     WHERE is_active = 1
     GROUP BY LOWER(TRIM(name))
     ORDER BY name COLLATE NOCASE`
  )
  .all();
db.close();

const ITEMS = rows.map((r) => ({
  name: r.name,
  generic_name: r.generic_name || '',
  manufacturer: r.manufacturer || 'Aneta Pharmaceuticals Pvt Ltd',
  hsn_code: r.hsn_code || '30049099',
  gst_rate: Number(r.gst_rate) || 5,
  dosage_form: r.dosage_form || '',
  category: r.category || '',
  pack_size: r.pack_size || '',
  schedule: r.schedule || null,
  storage_type: r.storage_type || null,
  rack: r.rack || null,
  reorder_level: r.reorder_level != null ? Number(r.reorder_level) : 10,
}));

const outPath = path.join(__dirname, '..', 'src', 'db', 'seed-aneta-medicines.ts');
const body = `import type Database from 'better-sqlite3';

/** Medicine master seed for client installs — applied once via migration v11. */
export type SeedMedicine = {
  name: string;
  generic_name: string;
  manufacturer: string;
  hsn_code: string;
  gst_rate: number;
  dosage_form: string;
  category: string;
  pack_size: string;
  schedule: string | null;
  storage_type: string | null;
  rack: string | null;
  reorder_level: number;
};

export const SEED_MEDICINES: SeedMedicine[] = ${JSON.stringify(ITEMS, null, 2)};

/** Insert missing seed medicines (case-insensitive name). Safe to re-run. */
export function seedAnetaMedicines(db: Database.Database): void {
  const exists = db.prepare(
    \`SELECT 1 AS ok FROM medicines WHERE is_active = 1 AND LOWER(name) = LOWER(?) LIMIT 1\`
  );
  const insert = db.prepare(\`
    INSERT INTO medicines
      (name, generic_name, manufacturer, hsn_code, gst_rate, dosage_form, category,
       pack_size, schedule, storage_type, rack, reorder_level, is_active)
    VALUES
      (@name, @generic_name, @manufacturer, @hsn_code, @gst_rate, @dosage_form, @category,
       @pack_size, @schedule, @storage_type, @rack, @reorder_level, 1)
  \`);
  const tx = db.transaction(() => {
    for (const item of SEED_MEDICINES) {
      const name = (item.name ?? '').trim();
      if (!name) continue;
      if (exists.get(name)) continue;
      insert.run({
        name,
        generic_name: item.generic_name || null,
        manufacturer: item.manufacturer || null,
        hsn_code: item.hsn_code || null,
        gst_rate: item.gst_rate,
        dosage_form: item.dosage_form || null,
        category: item.category || null,
        pack_size: item.pack_size || null,
        schedule: item.schedule,
        storage_type: item.storage_type,
        rack: item.rack,
        reorder_level: item.reorder_level,
      });
    }
  });
  tx();
}
`;

fs.writeFileSync(outPath, body);
console.log(`Wrote ${outPath} (${ITEMS.length} unique medicines from ${dbPath})`);
