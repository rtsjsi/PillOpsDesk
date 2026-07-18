import { describe, expect, it } from 'vitest';
import {
  deleteUser,
  hasUsers,
  login,
  registerUser,
} from '../src/db/services/auth';

describe('auth', () => {
  it('starts with no users', () => {
    expect(hasUsers()).toBe(false);
  });

  it('registers owner and logs in with correct PIN', () => {
    const user = registerUser('owner', '1234', 'owner');
    expect(user.username).toBe('owner');
    expect(user.role).toBe('owner');
    expect(hasUsers()).toBe(true);

    expect(login('owner', '1234')).toMatchObject({ id: user.id, role: 'owner' });
  });

  it('rejects wrong PIN', () => {
    registerUser('staff1', '9999', 'staff');
    expect(login('staff1', '0000')).toBeNull();
  });

  it('rejects duplicate username', () => {
    registerUser('alice', '1111', 'staff');
    expect(() => registerUser('alice', '2222', 'staff')).toThrow(/already taken/);
  });

  it('rejects empty username', () => {
    expect(() => registerUser('  ', '1234', 'owner')).toThrow(/Username is required/);
  });

  it('deletes a user', () => {
    const user = registerUser('temp', '1234', 'staff');
    deleteUser(user.id);
    expect(login('temp', '1234')).toBeNull();
  });
});
