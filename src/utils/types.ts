import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export type DomainName = 'accounts' | 'agents' | 'organizations' | 'incidents' | 'billing' | 'signals' | 'users';

export type CallToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  /**
   * UI-optimized data (e.g. MCP Apps card payloads). Kept separate from
   * `content`, which stays a plain, model-readable text summary — see
   * SEP-1865's structuredContent guidance.
   */
  structuredContent?: Record<string, unknown>;
};

export interface DomainHandler {
  getTools(): Tool[];
  handleCall(
    toolName: string,
    args: Record<string, unknown>,
    extra?: unknown
  ): Promise<CallToolResult>;
}

