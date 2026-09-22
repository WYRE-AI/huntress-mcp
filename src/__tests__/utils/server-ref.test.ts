import { describe, it, expect } from 'vitest';
import { runWithServerRef, bindServerRef, getServerRef } from '../../utils/server-ref.js';

function fakeServer(id: string) {
  return { id } as unknown as import('@modelcontextprotocol/sdk/server/index.js').Server;
}

describe('server-ref', () => {
  it('returns null when nothing is bound', () => {
    expect(getServerRef()).toBeNull();
  });

  it('runWithServerRef scopes the server to the callback and its awaited work', async () => {
    const server = fakeServer('a');
    const seen = await runWithServerRef(server, async () => {
      await Promise.resolve();
      return getServerRef();
    });
    expect(seen).toBe(server);
    expect(getServerRef()).toBeNull();
  });

  it('two concurrent runWithServerRef calls never observe each other\'s server', async () => {
    const serverA = fakeServer('a');
    const serverB = fakeServer('b');

    const resultA = runWithServerRef(serverA, async () => {
      await new Promise((r) => setTimeout(r, 10));
      return getServerRef();
    });
    const resultB = runWithServerRef(serverB, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return getServerRef();
    });

    const [a, b] = await Promise.all([resultA, resultB]);
    expect(a).toBe(serverA);
    expect(b).toBe(serverB);
  });

  it('bindServerRef binds for the rest of the synchronous scope onward', () => {
    const server = fakeServer('stdio');
    bindServerRef(server);
    expect(getServerRef()).toBe(server);
  });
});
