/**
 * Handler-invocation tests for the users (membership) domain.
 *
 * Same note as organizations.test.ts: create/update/delete are marked
 * HIGH-IMPACT / DESTRUCTIVE in their descriptions, but the handler carries
 * no server-side confirm-or-abort guard -- documented, not asserted as safe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient } = vi.hoisted(() => {
  const mockClient = {
    memberships: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };
  return { mockClient };
});
vi.mock('../../utils/client.js', () => ({ getClient: async () => mockClient }));

import { usersHandler } from '../../domains/users.js';

function parse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe('usersHandler.getTools', () => {
  it('exposes exactly the five membership tools', () => {
    const names = usersHandler.getTools().map((t) => t.name);
    expect(names).toEqual([
      'huntress_users_list',
      'huntress_users_get',
      'huntress_users_create',
      'huntress_users_update',
      'huntress_users_delete',
    ]);
  });

  it('marks create/update/delete as destructive in their annotations', () => {
    const tools = usersHandler.getTools();
    for (const name of ['huntress_users_create', 'huntress_users_update', 'huntress_users_delete']) {
      const tool = tools.find((t) => t.name === name)!;
      expect(tool.annotations?.destructiveHint).toBe(true);
    }
  });
});

describe('usersHandler.handleCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('huntress_users_list forwards limit/page_token/organization_id to the client', async () => {
    mockClient.memberships.list.mockResolvedValue({ memberships: [{ id: 1 }] });

    await usersHandler.handleCall('huntress_users_list', { limit: 20, organization_id: 3 });

    expect(mockClient.memberships.list).toHaveBeenCalledWith({
      limit: 20,
      page_token: undefined,
      organization_id: 3,
    });
  });

  it('huntress_users_get fetches by numeric id and returns the raw membership', async () => {
    mockClient.memberships.get.mockResolvedValue({ id: 6, permissions: 'Admin' });

    const result = await usersHandler.handleCall('huntress_users_get', { id: 6 });

    expect(mockClient.memberships.get).toHaveBeenCalledWith(6);
    expect(parse(result)).toEqual({ id: 6, permissions: 'Admin' });
  });

  it('huntress_users_create sends the invite payload including permissions and org scope', async () => {
    mockClient.memberships.create.mockResolvedValue({ id: 11, email: 'new@example.com' });

    const result = await usersHandler.handleCall('huntress_users_create', {
      email: 'new@example.com',
      first_name: 'New',
      last_name: 'User',
      permissions: 'Security Engineer',
      organization_id: 3,
    });

    expect(mockClient.memberships.create).toHaveBeenCalledWith({
      email: 'new@example.com',
      first_name: 'New',
      last_name: 'User',
      permissions: 'Security Engineer',
      organization_id: 3,
    });
    expect(parse(result)).toEqual({ id: 11, email: 'new@example.com' });
  });

  it('huntress_users_update sends id plus only the new permission level', async () => {
    mockClient.memberships.update.mockResolvedValue({ id: 6, permissions: 'User' });

    await usersHandler.handleCall('huntress_users_update', { id: 6, permissions: 'User' });

    expect(mockClient.memberships.update).toHaveBeenCalledWith(6, { permissions: 'User' });
  });

  it('huntress_users_delete deletes by id and returns a confirmation message with no guard', async () => {
    mockClient.memberships.delete.mockResolvedValue(undefined);

    const result = await usersHandler.handleCall('huntress_users_delete', { id: 6 });

    expect(mockClient.memberships.delete).toHaveBeenCalledWith(6);
    expect(result.content[0].text).toBe('Membership 6 deleted.');
    expect(result.isError).toBeUndefined();
  });

  it('returns an isError result for an unknown tool name', async () => {
    const result = await usersHandler.handleCall('huntress_not_a_real_tool', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('huntress_not_a_real_tool');
  });
});
