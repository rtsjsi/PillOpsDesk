import { getDb } from '../index';
import type { Supplier, SupplierInput, Customer, CustomerInput } from '@shared/types';

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

export function listSuppliers(search?: string): Supplier[] {
  const db = getDb();
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    return db
      .prepare(
        'SELECT * FROM suppliers WHERE name LIKE ? OR phone LIKE ? OR gstin LIKE ? OR pan LIKE ? ORDER BY name'
      )
      .all(q, q, q, q) as Supplier[];
  }
  return db.prepare('SELECT * FROM suppliers ORDER BY name').all() as Supplier[];
}

export function createSupplier(input: SupplierInput): Supplier {
  const db = getDb();
  const info = db
    .prepare(
      'INSERT INTO suppliers (name, phone, address, gstin, pan) VALUES (@name, @phone, @address, @gstin, @pan)'
    )
    .run({
      name: input.name,
      phone: blankToNull(input.phone),
      address: blankToNull(input.address),
      gstin: blankToNull(input.gstin),
      pan: blankToNull(input.pan),
    });
  return db
    .prepare('SELECT * FROM suppliers WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as Supplier;
}

export function updateSupplier(id: number, input: SupplierInput): Supplier {
  const db = getDb();
  db.prepare(
    'UPDATE suppliers SET name = @name, phone = @phone, address = @address, gstin = @gstin, pan = @pan WHERE id = @id'
  ).run({
    id,
    name: input.name,
    phone: blankToNull(input.phone),
    address: blankToNull(input.address),
    gstin: blankToNull(input.gstin),
    pan: blankToNull(input.pan),
  });
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id) as Supplier;
}

export function removeSupplier(id: number): void {
  getDb().prepare('DELETE FROM suppliers WHERE id = ?').run(id);
}

export function listCustomers(search?: string): Customer[] {
  const db = getDb();
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    return db
      .prepare(
        'SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? OR gstin LIKE ? OR pan LIKE ? ORDER BY name'
      )
      .all(q, q, q, q) as Customer[];
  }
  return db.prepare('SELECT * FROM customers ORDER BY name').all() as Customer[];
}

export function createCustomer(input: CustomerInput): Customer {
  const db = getDb();
  const info = db
    .prepare(
      'INSERT INTO customers (name, phone, address, gstin, pan) VALUES (@name, @phone, @address, @gstin, @pan)'
    )
    .run({
      name: input.name,
      phone: blankToNull(input.phone),
      address: blankToNull(input.address),
      gstin: blankToNull(input.gstin),
      pan: blankToNull(input.pan),
    });
  return db
    .prepare('SELECT * FROM customers WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as Customer;
}

export function updateCustomer(id: number, input: CustomerInput): Customer {
  const db = getDb();
  db.prepare(
    'UPDATE customers SET name = @name, phone = @phone, address = @address, gstin = @gstin, pan = @pan WHERE id = @id'
  ).run({
    id,
    name: input.name,
    phone: blankToNull(input.phone),
    address: blankToNull(input.address),
    gstin: blankToNull(input.gstin),
    pan: blankToNull(input.pan),
  });
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Customer;
}

export function removeCustomer(id: number): void {
  getDb().prepare('DELETE FROM customers WHERE id = ?').run(id);
}
