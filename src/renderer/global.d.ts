import type { PharmacyApi } from '../shared/api';

declare global {
  interface Window {
    pharmacy: PharmacyApi;
  }
}

export {};
