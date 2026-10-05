/**
 * Handler-invocation tests for the agents domain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient } = vi.hoisted(() => {
  const mockClient = {
    agents: { list: vi.fn(), get: vi.fn() },
  };
  return { mockClient };
});
vi.mock('../../utils/client.js', () => ({ getClient: async () => mockClient }));

import { agentsHandler } from '../../domains/agents.js';

function parse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe('agentsHandler.getTools', () => {
  it('exposes exactly the two agent tools', () => {
    const names = agentsHandler.getTools().map((t) => t.name);
    expect(names).toEqual(['huntress_agents_list', 'huntress_agents_get']);
  });
});

describe('agentsHandler.handleCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('huntress_agents_list forwards all filters to the client', async () => {
    mockClient.agents.list.mockResolvedValue({ agents: [{ id: 1, platform: 'darwin' }] });

    const result = await agentsHandler.handleCall('huntress_agents_list', {
      limit: 25,
      page_token: 'tok-1',
      organization_id: 7,
      platform: 'darwin',
    });

    expect(mockClient.agents.list).toHaveBeenCalledWith({
      limit: 25,
      page_token: 'tok-1',
      organization_id: 7,
      platform: 'darwin',
    });
    expect(parse(result)).toEqual({ agents: [{ id: 1, platform: 'darwin' }] });
  });

  it('huntress_agents_list with no args passes undefined filters (not omitted)', async () => {
    mockClient.agents.list.mockResolvedValue({ agents: [] });

    await agentsHandler.handleCall('huntress_agents_list', {});

    expect(mockClient.agents.list).toHaveBeenCalledWith({
      limit: undefined,
      page_token: undefined,
      organization_id: undefined,
      platform: undefined,
    });
  });

  it('huntress_agents_get fetches by numeric id and returns the raw agent', async () => {
    mockClient.agents.get.mockResolvedValue({ id: 9, hostname: 'DESKTOP-9' });

    const result = await agentsHandler.handleCall('huntress_agents_get', { id: 9 });

    expect(mockClient.agents.get).toHaveBeenCalledWith(9);
    expect(parse(result)).toEqual({ id: 9, hostname: 'DESKTOP-9' });
  });

  it('returns an isError result for an unknown tool name', async () => {
    const result = await agentsHandler.handleCall('huntress_not_a_real_tool', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('huntress_not_a_real_tool');
  });
});
