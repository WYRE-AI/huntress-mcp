import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../server.js';

// Regression for the EpiOn audit finding: the node-huntress SDK can return
// undefined from client.actor.get(), and JSON.stringify(undefined, null, 2)
// yields the VALUE undefined — so the server emitted
// {type: 'text', text: undefined}, which fails MCP client Zod validation
// (invalid_union on content[0]) on every call.
vi.mock('@wyre-technology/node-huntress', () => ({
  HuntressClient: class {
    accounts = { get: vi.fn().mockResolvedValue(undefined) };
    actor = { get: vi.fn().mockResolvedValue(undefined) };
  },
}));

describe('server content guard', () => {
  beforeEach(() => {
    process.env.HUNTRESS_API_KEY = 'test-key';
    process.env.HUNTRESS_API_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.HUNTRESS_API_KEY;
    delete process.env.HUNTRESS_API_SECRET;
  });

  async function connectedClient(): Promise<Client> {
    const server = createServer();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
  }

  it('never emits a text content block whose text is not a string, even when the SDK returns undefined', async () => {
    const client = await connectedClient();

    const result = await client.callTool({ name: 'huntress_accounts_actor', arguments: {} });

    const content = result.content as Array<{ type: string; text: unknown }>;
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
    for (const block of content) {
      expect(block.type).toBe('text');
      expect(typeof block.text).toBe('string');
    }
  });
});
