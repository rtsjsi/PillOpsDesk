/**
 * Generates src/db/seed-aneta-medicines.ts from scripts/import-aneta-pricelist.mjs
 * Run: node scripts/generate-aneta-seed.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const srcPath = path.join(__dirname, 'import-aneta-pricelist.mjs');
const src = fs.readFileSync(srcPath, 'utf8');
const start = src.indexOf('const ITEMS = [');
const end = src.indexOf('\n];', start);
if (start < 0 || end < 0) throw new Error('Could not find ITEMS array');
const block = src.slice(start, end + 3);

const sandbox = {};
// eslint-disable-next-line no-new-func
Function('sandbox', `${block.replace('const ITEMS', 'sandbox.ITEMS')};`)(sandbox);
const ITEMS = sandbox.ITEMS;
if (!Array.isArray(ITEMS) || ITEMS.length === 0) {
  throw new Error('ITEMS empty');
}

const outPath = path.join(__dirname, '..', 'src', 'db', 'seed-aneta-medicines.ts');
const body = `import type Database from 'better-sqlite3';

/** Aneta Pharmaceuticals master list — seeded once via migration v11. */
type SeedItem = {
  name: string;
  generic_name: string;
  dosage_form: string;
  pack_size: string;
  gst_rate: number;
  category: string;
};

const MANUFACTURER = 'Aneta Pharmaceuticals Pvt Ltd';

const ITEMS: SeedItem[] = ${JSON.stringify(ITEMS, null, 2)};

/** Insert missing Aneta medicines (case-insensitive name match). Safe to re-run. */
export function seedAnetaMedicines(db: Database.Database): void {
  const exists = db.prepare(
    \`SELECT 1 AS ok FROM medicines WHERE is_active = 1 AND LOWER(name) = LOWER(?) LIMIT 1\`
  );
  const insert = db.prepare(\`
    INSERT INTO medicines
      (name, generic_name, manufacturer, hsn_code, gst_rate, dosage_form, category,
       pack_size, schedule, storage_type, rack, reorder_level, is_active)
    VALUES
      (@name, @generic_name, @manufacturer, '30049099', @gst_rate, @dosage_form, @category,
       @pack_size, NULL, NULL, NULL, 10, 1)
  \`);
  const tx = db.transaction(() => {
    for (const item of ITEMS) {
      const name = item.name.trim();
      if (!name) continue;
      if (exists.get(name)) continue;
      insert.run({
        name,
        generic_name: item.generic_name,
        manufacturer: MANUFACTURER,
        gst_rate: item.gst_rate,
        dosage_form: item.dosage_form,
        category: item.category,
        pack_size: item.pack_size,
      });
    }
  });
  tx();
}
`;

fs.writeFileSync(outPath, body);
console.log(`Wrote ${outPath} (${ITEMS.length} items)`);
