import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient } from '../utils/client.js';
import { logger } from '../utils/logger.js';
import { INCIDENT_CARD_META, buildIncidentCard } from '../incident-card.js';

function getTools(): Tool[] {
  return [
    {
      name: 'huntress_incidents_list',
      description: 'List incident reports with optional filters.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number', description: 'Max results (1-500)' },
          page_token: { type: 'string', description: 'Pagination token' },
          status: { type: 'string', description: 'Filter by status' },
          severity: { type: 'string', description: 'Filter by severity' },
          platform: { type: 'string', description: 'Filter by platform' },
          organization_id: { type: 'number', description: 'Filter by org ID' },
          agent_id: { type: 'number', description: 'Filter by agent ID' },
        },
      },
    },
    {
      name: 'huntress_incidents_get',
      description: 'Get incident report by ID.',
      _meta: INCIDENT_CARD_META,
      inputSchema: {
        type: 'object' as const,
        properties: { id: { type: 'number', description: 'Incident report ID' } },
        required: ['id'],
      },
    },
    {
      name: 'huntress_incidents_resolve',
      description: 'Resolve an incident report.',
      _meta: INCIDENT_CARD_META,
      inputSchema: {
        type: 'object' as const,
        properties: { id: { type: 'number', description: 'Incident report ID' } },
        required: ['id'],
      },
    },
    {
      name: 'huntress_incidents_remediations',
      description: 'List remediations for an incident report.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          incident_report_id: { type: 'number', description: 'Incident report ID' },
          limit: { type: 'number' },
          page_token: { type: 'string' },
        },
        required: ['incident_report_id'],
      },
    },
    {
      name: 'huntress_incidents_remediation_get',
      description: 'Get a specific remediation.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          incident_report_id: { type: 'number', description: 'Incident report ID' },
          remediation_id: { type: 'number', description: 'Remediation ID' },
        },
        required: ['incident_report_id', 'remediation_id'],
      },
    },
    {
      name: 'huntress_incidents_bulk_approve',
      description: 'Bulk approve all remediations for an incident report.',
      inputSchema: {
        type: 'object' as const,
        properties: { incident_report_id: { type: 'number', description: 'Incident report ID' } },
        required: ['incident_report_id'],
      },
    },
    {
      name: 'huntress_incidents_bulk_reject',
      description: 'Bulk reject all remediations for an incident report.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          incident_report_id: { type: 'number', description: 'Incident report ID' },
          comment: { type: 'string', description: 'Reason for rejection' },
          useful: { type: 'boolean', description: 'Whether the plan was useful' },
          name: { type: 'string', description: 'Name of rejecting user' },
          phone_number: { type: 'string', description: 'Contact phone' },
          email: { type: 'string', description: 'Contact email' },
        },
        required: ['incident_report_id', 'comment'],
      },
    },
    {
      name: 'huntress_escalations_list',
      description: 'List escalations.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number' },
          page_token: { type: 'string' },
        },
      },
    },
    {
      name: 'huntress_escalations_get',
      description: 'Get escalation by ID (includes entities).',
      inputSchema: {
        type: 'object' as const,
        properties: { id: { type: 'number', description: 'Escalation ID' } },
        required: ['id'],
      },
    },
    {
      name: 'huntress_escalations_resolve',
      description: 'Resolve an escalation.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'number', description: 'Escalation ID' },
          determination: { type: 'string', enum: ['expected', 'unauthorized'], description: 'For unwanted access escalations' },
          scope: { type: 'string', enum: ['account', 'organization', 'identity'], description: 'Rule scope' },
        },
        required: ['id'],
      },
    },
  ];
}

async function handleCall(toolName: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const client = await getClient();

  switch (toolName) {
    case 'huntress_incidents_list': {
      logger.info('API call: incidentReports.list');
      const result = await client.incidentReports.list(args as any);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    case 'huntress_incidents_get': {
      const id = args.id as number;
      logger.info('API call: incidentReports.get', { id });
      const report = await client.incidentReports.get(id);
      // MCP Apps: attach the normalized card the ui:// incident card
      // renders from via structuredContent (kept separate from the plain
      // text summary below) — best-effort, a null card just omits the UI
      // surface without affecting the tool's data.
      const card = buildIncidentCard(report);
      const summary = `Incident report ${report.id}: ${report.subject || '(no subject)'} — status: ${report.status}, severity: ${report.severity}.`;
      return {
        content: [{ type: 'text', text: summary }],
        structuredContent: card ? { ...report, _card: card } : { ...report },
      };
    }
    case 'huntress_incidents_resolve': {
      const id = args.id as number;
      logger.info('API call: incidentReports.resolve', { id });
      await client.incidentReports.resolve(id);
      return { content: [{ type: 'text', text: `Incident report ${id} resolved.` }] };
    }
    case 'huntress_incidents_remediations': {
      const irId = args.incident_report_id as number;
      logger.info('API call: incidentReports.listRemediations', { irId });
      const result = await client.incidentReports.listRemediations(irId, {
        limit: args.limit as number | undefined,
        page_token: args.page_token as string | undefined,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    case 'huntress_incidents_remediation_get': {
      const irId = args.incident_report_id as number;
      const remId = args.remediation_id as number;
      logger.info('API call: incidentReports.getRemediation', { irId, remId });
      const rem = await client.incidentReports.getRemediation(irId, remId);
      return { content: [{ type: 'text', text: JSON.stringify(rem, null, 2) }] };
    }
    case 'huntress_incidents_bulk_approve': {
      const irId = args.incident_report_id as number;
      logger.info('API call: incidentReports.bulkApproveRemediations', { irId });
      await client.incidentReports.bulkApproveRemediations(irId);
      return { content: [{ type: 'text', text: `Remediations for incident ${irId} approved.` }] };
    }
    case 'huntress_incidents_bulk_reject': {
      const irId = args.incident_report_id as number;
      logger.info('API call: incidentReports.bulkRejectRemediations', { irId });
      await client.incidentReports.bulkRejectRemediations(irId, {
        comment: args.comment as string,
        useful: args.useful as boolean | undefined,
        name: args.name as string | undefined,
        phone_number: args.phone_number as string | undefined,
        email: args.email as string | undefined,
      });
      return { content: [{ type: 'text', text: `Remediations for incident ${irId} rejected.` }] };
    }
    case 'huntress_escalations_list': {
      logger.info('API call: escalations.list');
      const result = await client.escalations.list({
        limit: args.limit as number | undefined,
        page_token: args.page_token as string | undefined,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    case 'huntress_escalations_get': {
      const id = args.id as number;
      logger.info('API call: escalations.get', { id });
      const esc = await client.escalations.get(id);
      return { content: [{ type: 'text', text: JSON.stringify(esc, null, 2) }] };
    }
    case 'huntress_escalations_resolve': {
      const id = args.id as number;
      logger.info('API call: escalations.resolve', { id });
      await client.escalations.resolve(id, {
        determination: args.determination as 'expected' | 'unauthorized' | undefined,
        scope: args.scope as 'account' | 'organization' | 'identity' | undefined,
      });
      return { content: [{ type: 'text', text: `Escalation ${id} resolved.` }] };
    }
    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
  }
}

export const incidentsHandler: DomainHandler = { getTools, handleCall };
