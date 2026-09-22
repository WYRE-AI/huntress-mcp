/**
 * Handler-invocation tests for the organizations domain.
 *
 * Note: create/update/delete are marked HIGH-IMPACT / DESTRUCTIVE in their
 * tool descriptions and annotations, but the handler itself carries no
 * server-side confirm-or-abort guard (unlike e.g. alternative-payments-mcp's
 * archive-customer flow) -- these tests document the current (unguarded)
 * behavior, they don't assert a guard that doesn't exist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient } = vi.hoisted(() => {
  const mockClient = {
    organizations: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };
  return { mockClient };
});
vi.mock('../../utils/client.js', () => ({ getClient: async () => mockClient }));

import { organizationsHandler } from '../../domains/organizations.js';

function parse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe('organizationsHandler.getTools', () => {
  it('exposes exactly the five organization tools', () => {
    const names = organizationsHandler.getTools().map((t) => t.name);
    expect(names).toEqual([
      'huntress_organizations_list',
      'huntress_organizations_get',
      'huntress_organizations_create',
      'huntress_organizations_update',
      'huntress_organizations_delete',
    ]);
  });

  it('marks create/update/delete as destructive in their annotations', () => {
    const tools = organizationsHandler.getTools();
    for (const name of ['huntress_organizations_create', 'huntress_organizations_update', 'huntress_organizations_delete']) {
      const tool = tools.find((t) => t.name === name)!;
      expect(tool.annotations?.destructiveHint).toBe(true);
    }
  });
});

describe('organizationsHandler.handleCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('huntress_organizations_list forwards limit/page_token to the client', async () => {
    mockClient.organizations.list.mockResolvedValue({ organizations: [{ id: 1 }] });

    await organizationsHandler.handleCall('huntress_organizations_list', {
      limit: 50,
      page_token: 'tok-a',
    });

    expect(mockClient.organizations.list).toHaveBeenCalledWith({
      limit: 50,
      page_token: 'tok-a',
    });
  });

  it('huntress_organizations_get fetches by numeric id and returns the raw org', async () => {
    mockClient.organizations.get.mockResolvedValue({ id: 4, name: 'Contoso' });

    const result = await organizationsHandler.handleCall('huntress_organizations_get', { id: 4 });

    expect(mockClient.organizations.get).toHaveBeenCalledWith(4);
    expect(parse(result)).toEqual({ id: 4, name: 'Contoso' });
  });

  it('huntress_organizations_create sends only name/key, dropping unrelated args', async () => {
    mockClient.organizations.create.mockResolvedValue({ id: 10, name: 'NewCo' });

    const result = await organizationsHandler.handleCall('huntress_organizations_create', {
      name: 'NewCo',
      key: 'newco-key',
      unexpected: 'ignored',
    });

    expect(mockClient.organizations.create).toHaveBeenCalledWith({
      name: 'NewCo',
      key: 'newco-key',
    });
    expect(parse(result)).toEqual({ id: 10, name: 'NewCo' });
  });

  it('huntress_organizations_update sends id plus only the update fields', async () => {
    mockClient.organizations.update.mockResolvedValue({ id: 4, name: 'Contoso Ltd' });

    await organizationsHandler.handleCall('huntress_organizations_update', {
      id: 4,
      name: 'Contoso Ltd',
      report_recipients: ['a@example.com'],
    });

    expect(mockClient.organizations.update).toHaveBeenCalledWith(4, {
      name: 'Contoso Ltd',
      key: undefined,
      report_recipients: ['a@example.com'],
    });
  });

  it('huntress_organizations_delete deletes by id and returns a confirmation message with no guard', async () => {
    mockClient.organizations.delete.mockResolvedValue(undefined);

    const result = await organizationsHandler.handleCall('huntress_organizations_delete', { id: 7 });

    expect(mockClient.organizations.delete).toHaveBeenCalledWith(7);
    expect(result.content[0].text).toBe('Organization 7 deleted.');
    expect(result.isError).toBeUndefined();
  });

  it('returns an isError result for an unknown tool name', async () => {
    const result = await organizationsHandler.handleCall('huntress_not_a_real_tool', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('huntress_not_a_real_tool');
  });
});
