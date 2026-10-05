/**
 * Incident-card payload builder for the MCP Apps (SEP-1865) UI surface.
 *
 * huntress_incidents_get results get a normalized card object attached via
 * structuredContent (see server.ts / domains/incidents.ts) that the ui://
 * incident card renders from. The card is progressive enhancement:
 * normalization is best-effort, and a null return simply means the host
 * renders no card while the tool's JSON payload is unchanged.
 */

import type { IncidentReport } from '@wyre-technology/node-huntress';

export const INCIDENT_CARD_RESOURCE_URI = 'ui://huntress/incident-card.html';

/** MCP Apps resource MIME (RESOURCE_MIME_TYPE in @modelcontextprotocol/ext-apps). */
export const MCP_APP_RESOURCE_MIME = 'text/html;profile=mcp-app';

/**
 * Tool `_meta` advertising the card. Carries both the canonical flat key
 * (RESOURCE_URI_META_KEY in ext-apps) and the nested form ext-apps'
 * registerAppTool emits, so any MCP Apps host revision finds it.
 */
export const INCIDENT_CARD_META = {
  'ui/resourceUri': INCIDENT_CARD_RESOURCE_URI,
  ui: { resourceUri: INCIDENT_CARD_RESOURCE_URI },
} as const;

/** Mirror of IncidentCard in ui/incident-card.ts — keep in sync. */
export interface IncidentCard {
  id: number;
  title: string;
  summary?: string;
  status?: string;
  severity?: string;
  platform?: string;
  organizationId?: number;
  agentId?: number;
  closedAt?: string;
  updatedAt?: string;
  indicatorTypes?: string[];
  /** True while the incident is open — drives the "Resolve incident" button. */
  canResolve: boolean;
}

const CARD_SUMMARY_MAX_LENGTH = 500;

/**
 * Normalize a raw IncidentReport (SDK type) into the flat payload the ui://
 * incident card renders from. Returns null for invalid/missing input so a
 * failure to normalize never breaks the tool's JSON payload.
 */
export function buildIncidentCard(
  report: Partial<IncidentReport> | null | undefined
): IncidentCard | null {
  if (!report || typeof report.id !== 'number') {
    return null;
  }

  const card: IncidentCard = {
    id: report.id,
    title: report.subject || 'Incident',
    // closed_at is the authoritative "done" signal; status is a secondary
    // check since the SDK's status field values aren't a closed enum here.
    canResolve: report.closed_at == null && report.status !== 'closed' && report.status !== 'resolved',
  };

  if (typeof report.summary === 'string' && report.summary) {
    card.summary = report.summary.slice(0, CARD_SUMMARY_MAX_LENGTH);
  }
  if (typeof report.status === 'string' && report.status) {
    card.status = report.status.charAt(0).toUpperCase() + report.status.slice(1);
  }
  if (typeof report.severity === 'string' && report.severity) {
    card.severity = report.severity.charAt(0).toUpperCase() + report.severity.slice(1);
  }
  if (typeof report.platform === 'string' && report.platform) {
    card.platform = report.platform;
  }
  if (typeof report.organization_id === 'number') {
    card.organizationId = report.organization_id;
  }
  if (typeof report.agent_id === 'number') {
    card.agentId = report.agent_id;
  }
  if (typeof report.closed_at === 'string' && report.closed_at) {
    card.closedAt = report.closed_at;
  }
  if (typeof report.updated_at === 'string' && report.updated_at) {
    card.updatedAt = report.updated_at;
  }
  if (Array.isArray(report.indicator_types) && report.indicator_types.length > 0) {
    card.indicatorTypes = report.indicator_types;
  }

  return card;
}
