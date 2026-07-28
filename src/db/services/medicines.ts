import { getDb } from '../index';
import type { Medicine, MedicineInput } from '@shared/types';

export function listMedicines(search?: string): Medicine[] {
  const db = getDb();
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    return db
      .prepare(
        `SELECT * FROM medicines
         WHERE is_active = 1 AND (name LIKE ? OR generic_name LIKE ? OR manufacturer LIKE ?)
         ORDER BY name LIMIT 1000`
      )
      .all(q, q, q) as Medicine[];
  }
  return db
    .prepare('SELECT * FROM medicines WHERE is_active = 1 ORDER BY name LIMIT 1000')
    .all() as Medicine[];
}

export function getMedicine(id: number): Medicine | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as Medicine) ?? null;
}

/** Active medicine with the same name (case-insensitive), optionally excluding an id. */
function findActiveDuplicateName(name: string, excludeId?: number): Medicine | null {
  const db = getDb();
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (excludeId != null) {
    return (
      (db
        .prepare(
          `SELECT * FROM medicines
           WHERE is_active = 1 AND id != ? AND LOWER(name) = LOWER(?)
           LIMIT 1`
        )
        .get(excludeId, trimmed) as Medicine) ?? null
    );
  }
  return (
    (db
      .prepare(
        `SELECT * FROM medicines
         WHERE is_active = 1 AND LOWER(name) = LOWER(?)
         LIMIT 1`
      )
      .get(trimmed) as Medicine) ?? null
  );
}

function assertUniqueName(name: string, excludeId?: number): void {
  const dup = findActiveDuplicateName(name, excludeId);
  if (dup) {
    throw new Error(`A medicine named "${dup.name}" already exists.`);
  }
}

export function createMedicine(input: MedicineInput): Medicine {
  const db = getDb();
  const name = input.name.trim();
  if (!name) throw new Error('Medicine name is required.');
  assertUniqueName(name);
  const info = db
    .prepare(
      `INSERT INTO medicines
        (name, generic_name, manufacturer, hsn_code, gst_rate, dosage_form, category,
         pack_size, schedule, storage_type, rack, reorder_level, is_active)
       VALUES (@name, @generic_name, @manufacturer, @hsn_code, @gst_rate, @dosage_form, @category,
         @pack_size, @schedule, @storage_type, @rack, @reorder_level, @is_active)`
    )
    .run({
      name,
      generic_name: input.generic_name ?? null,
      manufacturer: input.manufacturer ?? null,
      hsn_code: input.hsn_code ?? null,
      gst_rate: input.gst_rate,
      dosage_form: input.dosage_form ?? null,
      category: input.category ?? null,
      pack_size: input.pack_size ?? null,
      schedule: input.schedule ?? null,
      storage_type: input.storage_type ?? null,
      rack: input.rack ?? null,
      reorder_level: input.reorder_level ?? 10,
      is_active: input.is_active ?? 1,
    });
  return getMedicine(Number(info.lastInsertRowid))!;
}

export function updateMedicine(id: number, input: MedicineInput): Medicine {
  const db = getDb();
  const name = input.name.trim();
  if (!name) throw new Error('Medicine name is required.');
  assertUniqueName(name, id);
  db.prepare(
    `UPDATE medicines SET
       name = @name, generic_name = @generic_name, manufacturer = @manufacturer,
       hsn_code = @hsn_code, gst_rate = @gst_rate, dosage_form = @dosage_form,
       category = @category, pack_size = @pack_size, schedule = @schedule,
       storage_type = @storage_type, rack = @rack, reorder_level = @reorder_level
     WHERE id = @id`
  ).run({
    id,
    name,
    generic_name: input.generic_name ?? null,
    manufacturer: input.manufacturer ?? null,
    hsn_code: input.hsn_code ?? null,
    gst_rate: input.gst_rate,
    dosage_form: input.dosage_form ?? null,
    category: input.category ?? null,
    pack_size: input.pack_size ?? null,
    schedule: input.schedule ?? null,
    storage_type: input.storage_type ?? null,
    rack: input.rack ?? null,
    reorder_level: input.reorder_level ?? 10,
  });
  return getMedicine(id)!;
}
