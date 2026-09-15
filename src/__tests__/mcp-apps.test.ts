/**
 * MCP Apps (SEP-1865) contract tests for the Huntress incident card —
 * mirrors the checks an MCP Apps host performs to render the card:
 *   1. renderable tools (huntress_incidents_get, huntress_incidents_resolve)
 *      advertise the UI resource via _meta
 *   2. the ui:// resource lists and reads back as profile=mcp-app HTML
 *   3. huntress_incidents_get results carry the normalized `_card` payload
 *      in structuredContent (NOT in content) — the structuredContent
 *      separation improvement over the fleet's prior pattern
 *   4. the server declares the io.modelcontextprotocol/ui extension in its
 *      capabilities — the explicit capability declaration improvement
 *   5. malformed/missing incidents degrade gracefully — card omitted, text
 *      payload unaffected
 *
 * Uses the in-memory transport + real Client/Server pairing (same pattern
 * as server.test.ts) so these are wire-level checks, not unit tests of
 * internal functions in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EXTENSION_ID } from '@modelcontextprotocol/ext-apps/server';
import { createServer } from '../server.js';
import {
  buildIncidentCard,
  INCIDENT_CARD_RESOURCE_URI,
  MCP_APP_RESOURCE_MIME,
} from '../incident-card.js';
import { INCIDENT_CARD_HTML } from '../generated/incident-card-html.js';

const mockIncidentGet = vi.fn();
const mockIncidentResolve = vi.fn();

vi.mock('@wyre-technology/node-huntress', () => ({
  HuntressClient: class {
    incidentReports = { get: mockIncidentGet, resolve: mockIncidentResolve };
  },
}));

const RENDERABLE_TOOLS = ['huntress_incidents_get', 'huntress_incidents_resolve'];

const openIncident = {
  id: 4242,
  account_id: 1,
  agent_id: 99,
  body: 'Full incident body',
  closed_at: null,
  indicator_counts: { malware: 2 },
  indicator_types: ['malware'],
  organization_id: 7,
  platform: 'windows',
  remediations: [],
  sent_at: '2026-01-01T00:00:00.000Z',
  severity: 'high',
  status: 'open',
  status_updated_at: '2026-01-01T00:00:00.000Z',
  subject: 'Suspicious process detected',
  summary: 'A suspicious process was detected and quarantined.',
  updated_at: '2026-01-02T00:00:00.000Z',
};

describe('MCP Apps incident card', () => {
  beforeEach(() => {
    process.env.HUNTRESS_API_KEY = 'test-key';
    process.env.HUNTRESS_API_SECRET = 'test-secret';
    mockIncidentGet.mockReset();
    mockIncidentResolve.mockReset();
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

  describe('server capability declaration', () => {
    it('advertises the io.modelcontextprotocol/ui extension explicitly', async () => {
      const client = await connectedClient();
      const caps = client.getServerCapabilities() as
        | { extensions?: Record<string, unknown> }
        | undefined;
      expect(caps?.extensions).toBeDefined();
      expect(caps?.extensions?.[EXTENSION_ID]).toBeDefined();
    });

    it('also declares a resources capability', async () => {
      const client = await connectedClient();
      const caps = client.getServerCapabilities() as { resources?: unknown } | undefined;
      expect(caps?.resources).toBeDefined();
    });
  });

  describe('tool _meta advertisement', () => {
    it.each(RENDERABLE_TOOLS)('%s links the card via _meta', async (name) => {
      const client = await connectedClient();
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === name);
      expect(tool).toBeDefined();
      expect(tool?._meta?.['ui/resourceUri']).toBe(INCIDENT_CARD_RESOURCE_URI);
      expect((tool?._meta?.ui as { resourceUri?: string })?.resourceUri).toBe(
        INCIDENT_CARD_RESOURCE_URI
      );
    });

    it('no other incidents-domain tools carry UI metadata', async () => {
      const client = await connectedClient();
      const { tools } = await client.listTools();
      const incidentsTools = tools.filter((t) => t.name.startsWith('huntress_incidents_'));
      const others = incidentsTools.filter(
        (t) => t._meta && !RENDERABLE_TOOLS.includes(t.name)
      );
      expect(others).toEqual([]);
    });
  });

  describe('ui:// resource', () => {
    it('is listed with the MCP Apps MIME type', async () => {
      const client = await connectedClient();
      const { resources } = await client.listResources();
      const card = resources.find((r) => r.uri === INCIDENT_CARD_RESOURCE_URI);
      expect(card).toBeDefined();
      expect(card?.mimeType).toBe(MCP_APP_RESOURCE_MIME);
    });

    it('reads back as profile=mcp-app HTML containing the card app', async () => {
      const client = await connectedClient();
      const result = await client.readResource({ uri: INCIDENT_CARD_RESOURCE_URI });
      const content = result.contents[0] as { mimeType?: string; text?: string };
      expect(content.mimeType).toBe(MCP_APP_RESOURCE_MIME);
      expect(content.text).toBe(INCIDENT_CARD_HTML);
      expect(content.text).toContain('card__bar');
      // The vite build must have inlined the bridge script — a bare
      // <script src> would be unloadable from a resources/read HTML string.
      expect(content.text).not.toContain('src="./incident-card.ts"');
    });

    it('rejects unknown resource URIs', async () => {
      const client = await connectedClient();
      await expect(
        client.readResource({ uri: 'ui://huntress/nope.html' })
      ).rejects.toThrow(/Unknown resource/);
    });
  });

  describe('huntress_incidents_get result — structuredContent separation', () => {
    it('keeps content plain text and puts the card in structuredContent', async () => {
      mockIncidentGet.mockResolvedValue(openIncident);
      const client = await connectedClient();

      const result = await client.callTool({
        name: 'huntress_incidents_get',
        arguments: { id: openIncident.id },
      });

      expect(result.isError).toBeFalsy();

      // content[0].text must be a plain readable summary, not a JSON dump.
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('text');
      expect(() => JSON.parse(content[0].text)).toThrow();
      expect(content[0].text).toContain(String(openIncident.id));
      expect(content[0].text).toContain(openIncident.subject);
      expect(content[0].text).toContain(openIncident.status);

      // structuredContent carries the full report plus the normalized card.
      const structured = result.structuredContent as
        | (typeof openIncident & { _card?: Record<string, unknown> })
        | undefined;
      expect(structured).toBeDefined();
      expect(structured?.id).toBe(openIncident.id);
      expect(structured?.subject).toBe(openIncident.subject);
      expect(structured?._card).toEqual({
        id: openIncident.id,
        title: openIncident.subject,
        summary: openIncident.summary,
        status: 'Open',
        severity: 'High',
        platform: openIncident.platform,
        organizationId: openIncident.organization_id,
        agentId: openIncident.agent_id,
        updatedAt: openIncident.updated_at,
        indicatorTypes: openIncident.indicator_types,
        canResolve: true,
      });
    });

    it('marks resolved incidents as not resolvable', async () => {
      mockIncidentGet.mockResolvedValue({
        ...openIncident,
        status: 'resolved',
        closed_at: '2026-01-03T00:00:00.000Z',
      });
      const client = await connectedClient();

      const result = await client.callTool({
        name: 'huntress_incidents_get',
        arguments: { id: openIncident.id },
      });

      const structured = result.structuredContent as { _card?: { canResolve?: boolean } };
      expect(structured._card?.canResolve).toBe(false);
    });
  });

  describe('huntress_incidents_resolve', () => {
    it('links the card and still returns a plain-text confirmation', async () => {
      mockIncidentResolve.mockResolvedValue(undefined);
      const client = await connectedClient();

      const result = await client.callTool({
        name: 'huntress_incidents_resolve',
        arguments: { id: openIncident.id },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain(String(openIncident.id));
      expect(content[0].text.toLowerCase()).toContain('resolved');
    });
  });

  describe('buildIncidentCard graceful degradation', () => {
    it('returns null for undefined/missing input', () => {
      expect(buildIncidentCard(undefined)).toBeNull();
      expect(buildIncidentCard(null)).toBeNull();
      expect(buildIncidentCard({} as never)).toBeNull();
    });

    it('survives a sparse incident (best-effort card)', () => {
      const card = buildIncidentCard({ id: 1 } as never);
      expect(card).toEqual({ id: 1, title: 'Incident', canResolve: true });
    });

    it('truncates long summaries', () => {
      const card = buildIncidentCard({ ...openIncident, summary: 'x'.repeat(2000) } as never);
      expect(card?.summary).toHaveLength(500);
    });

    it('degrades gracefully end-to-end: a malformed report still returns readable content with no card', async () => {
      // The SDK client can technically hand back an incomplete/malformed
      // object (e.g. missing id) — the tool's JSON/text output must remain
      // usable even when the card cannot be built.
      mockIncidentGet.mockResolvedValue({ subject: 'Bad record', status: 'open' });
      const client = await connectedClient();

      const result = await client.callTool({
        name: 'huntress_incidents_get',
        arguments: { id: 999 },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text.length).toBeGreaterThan(0);
      const structured = result.structuredContent as { _card?: unknown } | undefined;
      expect(structured?._card).toBeUndefined();
    });
  });
});
