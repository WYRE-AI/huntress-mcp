/**
 * HTTP transport fail-closed auth.
 *
 * Startup requires a real CONDUIT_S2S_SECRET unless MCP_ALLOW_INSECURE_DEV=1.
 * Known placeholder secrets are refused even with that flag.
 * The insecure-dev bypass listens on 127.0.0.1 only.
 * /mcp rejects a missing or invalid X-Gateway-S2S header.
 * AUTH_MODE=gateway rejects requests that omit vendor credential headers
 * and must not fall back to HUNTRESS_* in process.env.
 */

import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getCredentialsMock = vi.hoisted(() => vi.fn());
const runWithCredentialsMock = vi.hoisted(() => vi.fn());

vi.mock('../utils/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/client.js')>();
  return {
    ...actual,
    getCredentials: () => {
      getCredentialsMock();
      return actual.getCredentials();
    },
    runWithCredentials: <T>(creds: { apiKey: string; apiSecret: string }, fn: () => T): T => {
      runWithCredentialsMock(creds);
      return actual.runWithCredentials(creds, fn);
    },
  };
});

import { startHttpServer } from '../http.js';

const S2S_SECRET = 's2s-do-not-log-7f3a';
const ENV_API_KEY = 'env-api-key-must-not-be-used';
const ENV_API_SECRET = 'env-api-secret-must-not-be-used';

const ENV_KEYS = [
  'CONDUIT_S2S_SECRET',
  'MCP_ALLOW_INSECURE_DEV',
  'MCP_HTTP_PORT',
  'MCP_HTTP_HOST',
  'AUTH_MODE',
  'HUNTRESS_API_KEY',
  'HUNTRESS_API_SECRET',
  'LOG_LEVEL',
  'MCP_TRANSPORT',
] as const;

const savedEnv = new Map<string, string | undefined>();
const servers: Server[] = [];

function mintS2sHeader(secret: string, unixSeconds = Math.floor(Date.now() / 1000)): string {
  const message = `t=${unixSeconds}`;
  const hex = createHmac('sha256', secret).update(message).digest('hex');
  return `${message},v1=${hex}`;
}

function captureStderr(): { text: () => string; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  });
  return {
    text: () => lines.join('\n'),
    restore: () => spy.mockRestore(),
  };
}

function exitSpy() {
  return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${String(code)}`);
  }) as typeof process.exit);
}

async function listen(): Promise<{ port: number; address: string; server: Server }> {
  const server = await startHttpServer();
  servers.push(server);
  const bound = server.address() as AddressInfo | string | null;
  if (!bound || typeof bound === 'string') {
    throw new Error('HTTP server did not bind a TCP port');
  }
  return { port: bound.port, address: bound.address, server };
}

function mcpHeaders(extra?: Record<string, string | undefined>): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (!extra) return headers;
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) headers[key] = value;
  }
  return headers;
}

const statusCall = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'huntress_status', arguments: {} },
});

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  process.env.MCP_HTTP_PORT = '0';
  process.env.MCP_HTTP_HOST = '127.0.0.1';
  process.env.LOG_LEVEL = 'error';
  delete process.env.CONDUIT_S2S_SECRET;
  delete process.env.MCP_ALLOW_INSECURE_DEV;
  delete process.env.AUTH_MODE;
  delete process.env.HUNTRESS_API_KEY;
  delete process.env.HUNTRESS_API_SECRET;
  delete process.env.MCP_TRANSPORT;
  getCredentialsMock.mockClear();
  runWithCredentialsMock.mockClear();
});

afterEach(async () => {
  vi.restoreAllMocks();
  while (servers.length > 0) {
    const server = servers.pop();
    if (!server?.listening) continue;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe('HTTP startup', () => {
  it('refuses to start when CONDUIT_S2S_SECRET is empty', async () => {
    const logs = captureStderr();
    const exit = exitSpy();

    try {
      await expect(startHttpServer()).rejects.toThrow('process.exit:1');
      expect(exit).toHaveBeenCalledWith(1);
      const text = logs.text();
      expect(text).toContain('Refusing to start HTTP transport');
      expect(text).toContain('CONDUIT_S2S_SECRET is empty');
      expect(text).toContain('MCP_ALLOW_INSECURE_DEV=1');
      expect(text).not.toContain(S2S_SECRET);
    } finally {
      exit.mockRestore();
      logs.restore();
    }
  });

  it.each(['', '   '])('refuses a blank secret (%j)', async (secret) => {
    process.env.CONDUIT_S2S_SECRET = secret;
    const logs = captureStderr();
    const exit = exitSpy();

    try {
      await expect(startHttpServer()).rejects.toThrow('process.exit:1');
      expect(logs.text()).toContain('CONDUIT_S2S_SECRET is empty');
    } finally {
      exit.mockRestore();
      logs.restore();
    }
  });

  it.each(['true', '0', 'yes'])('still refuses when MCP_ALLOW_INSECURE_DEV is %s', async (flag) => {
    process.env.MCP_ALLOW_INSECURE_DEV = flag;
    const logs = captureStderr();
    const exit = exitSpy();

    try {
      await expect(startHttpServer()).rejects.toThrow('process.exit:1');
      expect(logs.text()).toContain('Refusing to start HTTP transport');
    } finally {
      exit.mockRestore();
      logs.restore();
    }
  });

  it.each(['changeme', 'CHANGE-ME', '  Your-S2S-Secret  ', 'replace-with-a-real-secret'])(
    'refuses known placeholder %j and does not log it',
    async (placeholder) => {
      process.env.CONDUIT_S2S_SECRET = placeholder;
      const logs = captureStderr();
      const exit = exitSpy();

      try {
        await expect(startHttpServer()).rejects.toThrow('process.exit:1');
        expect(exit).toHaveBeenCalledWith(1);
        const text = logs.text();
        expect(text).toContain('known placeholder');
        expect(text).toContain('openssl rand -hex 32');
        expect(text).not.toContain(placeholder.trim());
        expect(text).not.toContain(S2S_SECRET);
      } finally {
        exit.mockRestore();
        logs.restore();
      }
    },
  );

  it('refuses the placeholder "secret" without echoing the configured value', async () => {
    process.env.CONDUIT_S2S_SECRET = 'secret';
    const logs = captureStderr();
    const exit = exitSpy();

    try {
      await expect(startHttpServer()).rejects.toThrow('process.exit:1');
      const text = logs.text();
      expect(text).toContain('known placeholder');
      expect(text).not.toMatch(/CONDUIT_S2S_SECRET["'=:\s]+secret/i);
    } finally {
      exit.mockRestore();
      logs.restore();
    }
  });

  it('refuses a placeholder even when MCP_ALLOW_INSECURE_DEV=1', async () => {
    process.env.CONDUIT_S2S_SECRET = 'replace-me';
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    const logs = captureStderr();
    const exit = exitSpy();

    try {
      await expect(startHttpServer()).rejects.toThrow('process.exit:1');
      const text = logs.text();
      expect(text).toContain('known placeholder');
      expect(text).not.toContain('replace-me');
      expect(text).not.toContain('SECURITY WARNING');
    } finally {
      exit.mockRestore();
      logs.restore();
    }
  });

  it('allows startup with a warning when MCP_ALLOW_INSECURE_DEV=1 and binds 127.0.0.1', async () => {
    delete process.env.MCP_HTTP_HOST;
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    const logs = captureStderr();
    const exit = exitSpy();

    try {
      const server = await listen();
      expect(exit).not.toHaveBeenCalled();
      expect(server.address).toBe('127.0.0.1');
      const text = logs.text();
      expect(text).toContain('SECURITY WARNING');
      expect(text).toContain('CONDUIT_S2S_SECRET');
      expect(text).toContain('MCP_ALLOW_INSECURE_DEV');
      expect(text).toContain('127.0.0.1');
      expect(text).not.toContain('not a loopback address');
      expect(text).not.toContain(S2S_SECRET);
    } finally {
      exit.mockRestore();
      logs.restore();
    }
  });

  it.each(['0.0.0.0', '10.1.2.3'])(
    'forces 127.0.0.1 when the dev bypass is set and MCP_HTTP_HOST is %s',
    async (host) => {
      process.env.MCP_ALLOW_INSECURE_DEV = '1';
      process.env.MCP_HTTP_HOST = host;
      const logs = captureStderr();
      const exit = exitSpy();

      try {
        const server = await listen();
        expect(exit).not.toHaveBeenCalled();
        expect(server.address).toBe('127.0.0.1');
        const text = logs.text();
        expect(text).toContain(`MCP_HTTP_HOST=${host} is not a loopback address`);
        expect(text).toContain('Binding 127.0.0.1 only');
        expect(text).not.toContain(S2S_SECRET);
      } finally {
        exit.mockRestore();
        logs.restore();
      }
    },
  );

  it('still binds 127.0.0.1 for a loopback MCP_HTTP_HOST under the dev bypass', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_HTTP_HOST = 'localhost';
    const logs = captureStderr();

    try {
      const server = await listen();
      expect(server.address).toBe('127.0.0.1');
      expect(logs.text()).not.toContain('not a loopback address');
    } finally {
      logs.restore();
    }
  });

  it('honors a non-loopback MCP_HTTP_HOST when CONDUIT_S2S_SECRET is set', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    const logs = captureStderr();

    try {
      const server = await listen();
      expect(server.address).toBe('0.0.0.0');
      expect(logs.text()).not.toContain('not a loopback address');
      expect(logs.text()).not.toContain(S2S_SECRET);
    } finally {
      logs.restore();
    }
  });

  it('binds 127.0.0.1 when MCP_HTTP_HOST is unset and a secret is set', async () => {
    delete process.env.MCP_HTTP_HOST;
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    const server = await listen();
    expect(server.address).toBe('127.0.0.1');
  });

  it('keeps enforcing S2S when a real secret is set alongside the dev flag', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    process.env.AUTH_MODE = 'gateway';
    const logs = captureStderr();

    try {
      const server = await listen();
      expect(server.address).toBe('0.0.0.0');
      expect(logs.text()).not.toContain('SECURITY WARNING');
      expect(logs.text()).not.toContain(S2S_SECRET);

      const response = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: mcpHeaders(),
        body: statusCall,
      });
      expect(response.status).toBe(401);
      expect(await response.text()).toContain('X-Gateway-S2S');
      expect(getCredentialsMock).not.toHaveBeenCalled();
    } finally {
      logs.restore();
    }
  });
});

describe('HTTP /mcp authentication', () => {
  beforeEach(() => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.AUTH_MODE = 'gateway';
    process.env.HUNTRESS_API_KEY = ENV_API_KEY;
    process.env.HUNTRESS_API_SECRET = ENV_API_SECRET;
  });

  it('returns 401 when the S2S header is missing or invalid and does not log the secret', async () => {
    const logs = captureStderr();
    const server = await listen();
    try {
      const missing = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: mcpHeaders({
          'x-huntress-api-key': 'header-key',
          'x-huntress-api-secret': 'header-secret',
        }),
        body: statusCall,
      });
      const invalid = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: mcpHeaders({
          'x-gateway-s2s': mintS2sHeader('wrong-secret'),
          'x-huntress-api-key': 'header-key',
          'x-huntress-api-secret': 'header-secret',
        }),
        body: statusCall,
      });

      expect(missing.status).toBe(401);
      expect(invalid.status).toBe(401);
      const missingBody = await missing.text();
      const invalidBody = await invalid.text();
      expect(missingBody).toContain('X-Gateway-S2S');
      expect(invalidBody).toContain('X-Gateway-S2S');
      expect(missingBody).not.toContain(S2S_SECRET);
      expect(invalidBody).not.toContain(S2S_SECRET);
      expect(missingBody).not.toContain(ENV_API_KEY);
      expect(missingBody).not.toContain(ENV_API_SECRET);
      expect(logs.text()).not.toContain(S2S_SECRET);
      expect(getCredentialsMock).not.toHaveBeenCalled();
      expect(runWithCredentialsMock).not.toHaveBeenCalled();
    } finally {
      logs.restore();
    }
  });

  it('returns 401 in gateway mode without credential headers and does not use env credentials', async () => {
    const server = await listen();
    const response = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: 'POST',
      headers: mcpHeaders({ 'x-gateway-s2s': mintS2sHeader(S2S_SECRET) }),
      body: statusCall,
    });
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(body).toContain('missing required gateway credential headers');
    expect(body).toContain('X-Huntress-Api-Key');
    expect(body).toContain('X-Huntress-Api-Secret');
    expect(body).not.toContain(ENV_API_KEY);
    expect(body).not.toContain(ENV_API_SECRET);
    expect(body).not.toContain(S2S_SECRET);
    expect(getCredentialsMock).not.toHaveBeenCalled();
    expect(runWithCredentialsMock).not.toHaveBeenCalled();
  });

  it.each([
    { 'x-huntress-api-key': 'header-key' },
    { 'x-huntress-api-secret': 'header-secret' },
    { 'x-huntress-api-key': 'header-key', 'x-huntress-api-secret': '   ' },
  ])('returns 401 when a gateway credential header is missing or blank (%j)', async (headers) => {
    const server = await listen();
    const response = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: 'POST',
      headers: mcpHeaders({
        'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
        ...headers,
      }),
      body: statusCall,
    });

    expect(response.status).toBe(401);
    expect(runWithCredentialsMock).not.toHaveBeenCalled();
    expect(getCredentialsMock).not.toHaveBeenCalled();
  });

  it('accepts a valid S2S header plus credential headers and uses those credentials', async () => {
    const logs = captureStderr();
    const server = await listen();
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: mcpHeaders({
          'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
          'x-huntress-api-key': 'header-key',
          'x-huntress-api-secret': 'header-secret',
        }),
        body: statusCall,
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).not.toContain(S2S_SECRET);
      expect(body).not.toContain(ENV_API_KEY);
      expect(body).not.toContain(ENV_API_SECRET);
      const payload = JSON.parse(body) as {
        result?: { content?: Array<{ text?: string }> };
      };
      const text = payload.result?.content?.[0]?.text ?? '';
      const status = JSON.parse(text) as { connected?: boolean };
      expect(status.connected).toBe(true);
      expect(logs.text()).not.toContain(S2S_SECRET);
      expect(runWithCredentialsMock).toHaveBeenCalledWith({
        apiKey: 'header-key',
        apiSecret: 'header-secret',
      });
      expect(getCredentialsMock).toHaveBeenCalled();
    } finally {
      logs.restore();
    }
  });

  it('serves /health and /healthz without authentication and without reading credentials', async () => {
    const server = await listen();
    for (const path of ['/health', '/healthz']) {
      const response = await fetch(`http://127.0.0.1:${server.port}${path}`);
      expect(response.status).toBe(200);
      const body = await response.json() as { status?: string; mode?: string; credentials?: unknown };
      expect(body.status).toBe('ok');
      expect(body.mode).toBe('gateway');
      expect(body.credentials).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(S2S_SECRET);
      expect(JSON.stringify(body)).not.toContain(ENV_API_KEY);
    }
    expect(getCredentialsMock).not.toHaveBeenCalled();
    expect(runWithCredentialsMock).not.toHaveBeenCalled();
  });

  it('does not enforce X-Gateway-S2S on the insecure-dev bypass, but gateway mode still requires credentials', async () => {
    delete process.env.CONDUIT_S2S_SECRET;
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    const logs = captureStderr();
    try {
      const server = await listen();
      const response = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: mcpHeaders(),
        body: statusCall,
      });
      const body = await response.text();
      expect(response.status).toBe(401);
      expect(body).toContain('X-Huntress-Api-Key');
      expect(body).not.toContain('X-Gateway-S2S');
      expect(body).not.toContain(ENV_API_KEY);
      expect(getCredentialsMock).not.toHaveBeenCalled();
      expect(logs.text()).not.toContain(ENV_API_SECRET);
    } finally {
      logs.restore();
    }
  });
});

describe('HTTP env mode', () => {
  it('uses process env credentials after a valid S2S header when AUTH_MODE is not gateway', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    delete process.env.AUTH_MODE;
    process.env.HUNTRESS_API_KEY = 'env-key';
    process.env.HUNTRESS_API_SECRET = 'env-secret';
    const server = await listen();

    const response = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: 'POST',
      headers: mcpHeaders({ 'x-gateway-s2s': mintS2sHeader(S2S_SECRET) }),
      body: statusCall,
    });
    const body = await response.text();
    expect(response.status).toBe(200);
    const payload = JSON.parse(body) as {
      result?: { content?: Array<{ text?: string }> };
    };
    const status = JSON.parse(payload.result?.content?.[0]?.text ?? '') as { connected?: boolean };
    expect(status.connected).toBe(true);
    expect(runWithCredentialsMock).not.toHaveBeenCalled();
    expect(getCredentialsMock).toHaveBeenCalled();
    expect(body).not.toContain(S2S_SECRET);
  });
});
