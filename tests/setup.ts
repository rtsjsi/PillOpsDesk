import { afterEach, beforeEach } from 'vitest';
import { closeDb, initTestDb } from '../src/db/index';

beforeEach(() => {
  initTestDb();
});

afterEach(() => {
  closeDb();
});
