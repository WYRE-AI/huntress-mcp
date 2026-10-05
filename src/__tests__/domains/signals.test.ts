/**
 * Handler-invocation tests for the signals domain.
 *
 * Note: huntress_signals_list forwards `args` to the client as-is (unlike
 * agents/organizations, which reconstruct an explicit params object) — the
 * "all filters passed through" test below pins that behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient } = vi.hoisted(() => {
  const mockClient = {
    signals: { list: vi.fn(), get: vi.fn() },
  };
  return { mockClient };
});
vi.mock('../../utils/client.js', () => ({ getClient: async () => mockClient }));

import { signalsHandler } from '../../domains/signals.js';

function parse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe('signalsHandler.getTools', () => {
  it('exposes exactly the two signal tools', () => {
    const names = signalsHandler.getTools().map((t) => t.name);
    expect(names).toEqual(['huntress_signals_list', 'huntress_signals_get']);
  });
});

describe('signalsHandler.handleCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('huntress_signals_list forwards the whole args object to the client', async () => {
    mockClient.signals.list.mockResolvedValue({ signals: [{ id: 1, entity_type: 'user' }] });

    const args = {
      limit: 10,
      organization_id: 3,
      types: 'unwanted_access',
      statuses: 'investigated',
    };
    const result = await signalsHandler.handleCall('huntress_signals_list', args);

    expect(mockClient.signals.list).toHaveBeenCalledWith(args);
    expect(parse(result)).toEqual({ signals: [{ id: 1, entity_type: 'user' }] });
  });

  it('huntress_signals_get fetches by numeric id and returns the raw signal', async () => {
    mockClient.signals.get.mockResolvedValue({ id: 5, entity_id: 'e-5' });

    const result = await signalsHandler.handleCall('huntress_signals_get', { id: 5 });

    expect(mockClient.signals.get).toHaveBeenCalledWith(5);
    expect(parse(result)).toEqual({ id: 5, entity_id: 'e-5' });
  });

  it('returns an isError result for an unknown tool name', async () => {
    const result = await signalsHandler.handleCall('huntress_not_a_real_tool', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('huntress_not_a_real_tool');
  });
});
