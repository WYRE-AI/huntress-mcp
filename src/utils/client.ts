import { AsyncLocalStorage } from 'node:async_hooks';
import { HuntressClient } from '@wyre-technology/node-huntress';
import { logger } from './logger.js';

export interface Credentials {
  apiKey: string;
  apiSecret: string;
}

// Request-scoped credential store. In gateway mode the HTTP layer runs each
// request inside runWithCredentials({apiKey, apiSecret}); getCredentials()
// reads from it. Falls back to process.env for stdio/single-tenant mode.
const credStore = new AsyncLocalStorage<Credentials>();

export function runWithCredentials<T>(creds: Credentials, fn: () => T): T {
  return credStore.run(creds, fn);
}

export function getCredentials(): Credentials | null {
  const scoped = credStore.getStore();
  if (scoped?.apiKey && scoped?.apiSecret) return scoped;
  const apiKey = process.env.HUNTRESS_API_KEY;
  const apiSecret = process.env.HUNTRESS_API_SECRET;
  if (!apiKey || !apiSecret) {
    logger.warn('Missing credentials', { hasApiKey: !!apiKey, hasApiSecret: !!apiSecret });
    return null;
  }
  return { apiKey, apiSecret };
}

// Constructs a client from the request-scoped (or env) credentials. The client
// is cheap and holds no shared mutable state, so we build one per call — never
// a process-global singleton.
export async function getClient(): Promise<HuntressClient> {
  const creds = getCredentials();
  if (!creds) {
    throw new Error('No Huntress API credentials configured. Set HUNTRESS_API_KEY and HUNTRESS_API_SECRET.');
  }
  return new HuntressClient(creds);
}
