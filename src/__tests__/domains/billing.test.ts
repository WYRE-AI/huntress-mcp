/**
 * Handler-invocation tests for the billing domain (billing reports + summary reports).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient } = vi.hoisted(() => {
  const mockClient = {
    billingReports: { list: vi.fn(), get: vi.fn() },
    summaryReports: { list: vi.fn(), get: vi.fn() },
  };
  return { mockClient };
});
vi.mock('../../utils/client.js', () => ({ getClient: async () => mockClient }));

import { billingHandler } from '../../domains/billing.js';

function parse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe('billingHandler.getTools', () => {
  it('exposes exactly the four billing/summary report tools', () => {
    const names = billingHandler.getTools().map((t) => t.name);
    expect(names).toEqual([
      'huntress_billing_reports_list',
      'huntress_billing_reports_get',
      'huntress_summary_reports_list',
      'huntress_summary_reports_get',
    ]);
  });
});

describe('billingHandler.handleCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('huntress_billing_reports_list forwards the whole args object to the client', async () => {
    mockClient.billingReports.list.mockResolvedValue({ reports: [{ id: 1, status: 'paid' }] });

    const args = { limit: 10, status: 'paid' };
    const result = await billingHandler.handleCall('huntress_billing_reports_list', args);

    expect(mockClient.billingReports.list).toHaveBeenCalledWith(args);
    expect(parse(result)).toEqual({ reports: [{ id: 1, status: 'paid' }] });
  });

  it('huntress_billing_reports_get fetches by numeric id and returns the raw report', async () => {
    mockClient.billingReports.get.mockResolvedValue({ id: 3, status: 'open' });

    const result = await billingHandler.handleCall('huntress_billing_reports_get', { id: 3 });

    expect(mockClient.billingReports.get).toHaveBeenCalledWith(3);
    expect(parse(result)).toEqual({ id: 3, status: 'open' });
  });

  it('huntress_summary_reports_list forwards the whole args object to the client', async () => {
    mockClient.summaryReports.list.mockResolvedValue({ reports: [{ id: 2, organization_id: 5 }] });

    const args = { period_min: '2026-08-01', organization_id: 5 };
    const result = await billingHandler.handleCall('huntress_summary_reports_list', args);

    expect(mockClient.summaryReports.list).toHaveBeenCalledWith(args);
    expect(parse(result)).toEqual({ reports: [{ id: 2, organization_id: 5 }] });
  });

  it('huntress_summary_reports_get fetches by numeric id and returns the raw report', async () => {
    mockClient.summaryReports.get.mockResolvedValue({ id: 8, type: 'monthly' });

    const result = await billingHandler.handleCall('huntress_summary_reports_get', { id: 8 });

    expect(mockClient.summaryReports.get).toHaveBeenCalledWith(8);
    expect(parse(result)).toEqual({ id: 8, type: 'monthly' });
  });

  it('returns an isError result for an unknown tool name', async () => {
    const result = await billingHandler.handleCall('huntress_not_a_real_tool', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('huntress_not_a_real_tool');
  });
});
