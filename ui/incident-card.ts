/**
 * Iframe bridge + renderer for the Huntress incident card (MCP Apps, SEP-1865).
 *
 * Runs inside the host's sandboxed iframe. Uses the official MCP Apps client
 * (`App`) to receive the tool result from the host and to call
 * huntress_incidents_resolve back (the "Resolve incident" round-trip).
 *
 * The server attaches a normalized card payload to huntress_incidents_get
 * results via structuredContent._card (see src/incident-card.ts) so this
 * renderer never needs to interpret raw incident report objects itself.
 *
 * Rendering uses DOM construction (no innerHTML) — incident subjects and
 * summaries are untrusted platform data, so text only ever lands in text
 * nodes.
 */
import { App } from '@modelcontextprotocol/ext-apps';

/** Mirror of IncidentCard in src/incident-card.ts — keep in sync. */
interface IncidentCard {
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
  canResolve: boolean;
}

const app = new App({ name: 'Huntress Incident Card', version: '1.0.0' });
let current: IncidentCard | null = null;

/** Create an element with a class and (safe, text-node) children. */
function el(tag: string, className = '', ...children: Array<Node | string | null>): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) {
    if (child == null) continue;
    node.append(child); // strings become text nodes — never parsed as HTML
  }
  return node;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function field(label: string, value: string | undefined): HTMLElement | null {
  if (!value) return null;
  return el('div', 'field', el('div', 'field__label', label), el('div', 'field__value', value));
}

function badge(text: string | undefined, cls: string): HTMLElement | null {
  return text ? el('span', `badge ${cls}`, text) : null;
}

function render(c: IncidentCard): void {
  current = c;

  let summarySection: HTMLElement | null = null;
  if (c.summary) {
    summarySection = el(
      'div',
      'summary',
      el('div', 'summary__h', 'Summary'),
      el('div', 'summary__body', c.summary)
    );
  }

  let actions: HTMLElement | null = null;
  if (c.canResolve) {
    const btn = el('button', 'btn', 'Resolve incident') as HTMLButtonElement;
    btn.id = 'resolve-btn';
    btn.addEventListener('click', async () => {
      if (!current?.canResolve) return;
      btn.disabled = true;
      btn.textContent = 'Resolving…';
      try {
        // The card already holds the incident id — resolving is the one
        // write action this card exposes.
        await app.callServerTool({
          name: 'huntress_incidents_resolve',
          arguments: { id: current.id },
        });
        current = { ...current, status: 'Resolved', canResolve: false };
        render(current);
      } catch {
        btn.disabled = false;
        btn.textContent = 'Resolve incident';
      }
    });
    actions = el('div', 'actions', btn);
  }

  const body = el(
    'div',
    'card__body',
    el('div', 'idrow', el('span', 'incidentid', `Incident #${c.id} · Huntress`)),
    el('h1', '', c.title),
    el('div', 'badges', badge(c.severity, 'badge--sev'), badge(c.status, 'badge--status')),
    el(
      'div',
      'grid',
      field('Platform', c.platform),
      field('Organization', c.organizationId != null ? String(c.organizationId) : undefined),
      field('Agent', c.agentId != null ? String(c.agentId) : undefined),
      field('Updated', c.updatedAt && fmtDate(c.updatedAt)),
      field('Closed', c.closedAt && fmtDate(c.closedAt))
    ),
    summarySection,
    actions
  );

  const root = document.getElementById('root')!;
  root.replaceChildren(el('div', 'card', el('div', 'card__bar'), body));
}

// The card renderer reads the card from the structuredContent payload
// (structuredContent._card), NOT from content[0].text — huntress-mcp keeps
// content plain-text-only per MCP Apps structuredContent separation.
function extractCard(result: unknown): IncidentCard | null {
  const structured = (result as { structuredContent?: { _card?: IncidentCard } })
    ?.structuredContent;
  const card = structured?._card;
  return card && typeof card.id === 'number' && card.title ? card : null;
}

// Must be set before connect() so the initial tool-result isn't missed.
app.ontoolresult = (result: unknown) => {
  const card = extractCard(result);
  if (card) render(card);
};

app.connect();
