/**
 * Handler-invocation tests for the incidents domain (incident reports,
 * remediations, and escalations).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient } = vi.hoisted(() => {
  const mockClient = {
    incidentReports: {
      list: vi.fn(),
      get: vi.fn(),
      resolve: vi.fn(),
      listRemediations: vi.fn(),
      getRemediation: vi.fn(),
      bulkApproveRemediations: vi.fn(),
      bulkRejectRemediations: vi.fn(),
    },
    escalations: { list: vi.fn(), get: vi.fn(), resolve: vi.fn() },
  };
  return { mockClient };
});
vi.mock('../../utils/client.js', () => ({ getClient: async () => mockClient }));

import { incidentsHandler } from '../../domains/incidents.js';

function parse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe('incidentsHandler.getTools', () => {
  it('exposes exactly the ten incident/escalation tools', () => {
    const names = incidentsHandler.getTools().map((t) => t.name);
    expect(names).toEqual([
      'huntress_incidents_list',
      'huntress_incidents_get',
      'huntress_incidents_resolve',
      'huntress_incidents_remediations',
      'huntress_incidents_remediation_get',
      'huntress_incidents_bulk_approve',
      'huntress_incidents_bulk_reject',
      'huntress_escalations_list',
      'huntress_escalations_get',
      'huntress_escalations_resolve',
    ]);
  });
});

describe('incidentsHandler.handleCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('huntress_incidents_list forwards the whole args object to the client', async () => {
    mockClient.incidentReports.list.mockResolvedValue({ incident_reports: [{ id: 1, severity: 'high' }] });

    const args = { status: 'open', severity: 'high', organization_id: 2 };
    const result = await incidentsHandler.handleCall('huntress_incidents_list', args);

    expect(mockClient.incidentReports.list).toHaveBeenCalledWith(args);
    expect(parse(result)).toEqual({ incident_reports: [{ id: 1, severity: 'high' }] });
  });

  it('huntress_incidents_get fetches by numeric id and returns the raw report', async () => {
    mockClient.incidentReports.get.mockResolvedValue({ id: 3, status: 'open' });

    const result = await incidentsHandler.handleCall('huntress_incidents_get', { id: 3 });

    expect(mockClient.incidentReports.get).toHaveBeenCalledWith(3);
    expect(parse(result)).toEqual({ id: 3, status: 'open' });
  });

  it('huntress_incidents_resolve resolves by id with no confirmation guard', async () => {
    mockClient.incidentReports.resolve.mockResolvedValue(undefined);

    const result = await incidentsHandler.handleCall('huntress_incidents_resolve', { id: 3 });

    expect(mockClient.incidentReports.resolve).toHaveBeenCalledWith(3);
    expect(result.content[0].text).toBe('Incident report 3 resolved.');
  });

  it('huntress_incidents_remediations forwards incident_report_id plus pagination', async () => {
    mockClient.incidentReports.listRemediations.mockResolvedValue({ remediations: [{ id: 9 }] });

    await incidentsHandler.handleCall('huntress_incidents_remediations', {
      incident_report_id: 3,
      limit: 5,
    });

    expect(mockClient.incidentReports.listRemediations).toHaveBeenCalledWith(3, {
      limit: 5,
      page_token: undefined,
    });
  });

  it('huntress_incidents_remediation_get fetches by report id + remediation id', async () => {
    mockClient.incidentReports.getRemediation.mockResolvedValue({ id: 9, action: 'quarantine' });

    const result = await incidentsHandler.handleCall('huntress_incidents_remediation_get', {
      incident_report_id: 3,
      remediation_id: 9,
    });

    expect(mockClient.incidentReports.getRemediation).toHaveBeenCalledWith(3, 9);
    expect(parse(result)).toEqual({ id: 9, action: 'quarantine' });
  });

  it('huntress_incidents_bulk_approve approves by incident_report_id', async () => {
    mockClient.incidentReports.bulkApproveRemediations.mockResolvedValue(undefined);

    const result = await incidentsHandler.handleCall('huntress_incidents_bulk_approve', {
      incident_report_id: 3,
    });

    expect(mockClient.incidentReports.bulkApproveRemediations).toHaveBeenCalledWith(3);
    expect(result.content[0].text).toBe('Remediations for incident 3 approved.');
  });

  it('huntress_incidents_bulk_reject sends the reject payload separately from the incident id', async () => {
    mockClient.incidentReports.bulkRejectRemediations.mockResolvedValue(undefined);

    const result = await incidentsHandler.handleCall('huntress_incidents_bulk_reject', {
      incident_report_id: 3,
      comment: 'False positive',
      useful: false,
    });

    expect(mockClient.incidentReports.bulkRejectRemediations).toHaveBeenCalledWith(3, {
      comment: 'False positive',
      useful: false,
      name: undefined,
      phone_number: undefined,
      email: undefined,
    });
    expect(result.content[0].text).toBe('Remediations for incident 3 rejected.');
  });

  it('huntress_escalations_list forwards limit/page_token to the client', async () => {
    mockClient.escalations.list.mockResolvedValue({ escalations: [{ id: 1 }] });

    await incidentsHandler.handleCall('huntress_escalations_list', { limit: 15 });

    expect(mockClient.escalations.list).toHaveBeenCalledWith({ limit: 15, page_token: undefined });
  });

  it('huntress_escalations_get fetches by numeric id and returns the raw escalation', async () => {
    mockClient.escalations.get.mockResolvedValue({ id: 4, entities: [] });

    const result = await incidentsHandler.handleCall('huntress_escalations_get', { id: 4 });

    expect(mockClient.escalations.get).toHaveBeenCalledWith(4);
    expect(parse(result)).toEqual({ id: 4, entities: [] });
  });

  it('huntress_escalations_resolve sends id plus determination/scope', async () => {
    mockClient.escalations.resolve.mockResolvedValue(undefined);

    const result = await incidentsHandler.handleCall('huntress_escalations_resolve', {
      id: 4,
      determination: 'unauthorized',
      scope: 'identity',
    });

    expect(mockClient.escalations.resolve).toHaveBeenCalledWith(4, {
      determination: 'unauthorized',
      scope: 'identity',
    });
    expect(result.content[0].text).toBe('Escalation 4 resolved.');
  });

  it('returns an isError result for an unknown tool name', async () => {
    const result = await incidentsHandler.handleCall('huntress_not_a_real_tool', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('huntress_not_a_real_tool');
  });
});
