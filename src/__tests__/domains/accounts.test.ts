/**
 * Handler-invocation tests for the accounts domain.
 *
 * Mocks utils/client.js, then invokes accountsHandler.handleCall directly and
 * asserts the exact call made to the underlying SDK client and the response
 * passthrough back into a CallToolResult.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient } = vi.hoisted(() => {
  const mockClient = {
    accounts: { get: vi.fn() },
    actor: { get: vi.fn() },
  };
  return { mockClient };
});
vi.mock('../../utils/client.js', () => ({ getClient: async () => mockClient }));

import { accountsHandler } from '../../domains/accounts.js';

function parse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe('accountsHandler.getTools', () => {
  it('exposes exactly the two account tools', () => {
    const names = accountsHandler.getTools().map((t) => t.name);
    expect(names).toEqual(['huntress_accounts_get', 'huntress_accounts_actor']);
  });
});

describe('accountsHandler.handleCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('huntress_accounts_get returns the raw account object', async () => {
    mockClient.accounts.get.mockResolvedValue({ id: 1, name: 'Acme MSP' });

    const result = await accountsHandler.handleCall('huntress_accounts_get', {});

    expect(mockClient.accounts.get).toHaveBeenCalledWith();
    expect(parse(result)).toEqual({ id: 1, name: 'Acme MSP' });
    expect(result.isError).toBeUndefined();
  });

  it('huntress_accounts_actor returns the raw actor object', async () => {
    mockClient.actor.get.mockResolvedValue({ type: 'user', id: 42 });

    const result = await accountsHandler.handleCall('huntress_accounts_actor', {});

    expect(mockClient.actor.get).toHaveBeenCalledWith();
    expect(parse(result)).toEqual({ type: 'user', id: 42 });
  });

  it('returns an isError result for an unknown tool name', async () => {
    const result = await accountsHandler.handleCall('huntress_not_a_real_tool', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('huntress_not_a_real_tool');
  });
});
