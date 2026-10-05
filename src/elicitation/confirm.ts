import { getServerRef } from '../utils/server-ref.js';
import { logger } from '../utils/logger.js';
import type { CallToolResult } from '../utils/types.js';

/**
 * Ask the user to confirm a destructive action.
 *
 * Returns:
 *  - `true`  → user explicitly confirmed (proceed)
 *  - `false` → user declined (abort)
 *  - `null`  → elicitation unavailable/failed (caller decides; this server
 *              treats null as "do not proceed" for destructive operations)
 *
 * Elicitation is additive: any failure is swallowed and surfaced as `null`.
 */
export async function elicitConfirmation(summary: string): Promise<boolean | null> {
  const server = getServerRef();
  if (!server) return null;
  try {
    const result = await (
      server as unknown as {
        elicitInput: (req: unknown) => Promise<{
          action?: string;
          content?: Record<string, unknown>;
        }>;
      }
    ).elicitInput({
      mode: 'form',
      message: `${summary}\n\nThis action cannot be undone. Type "confirm" to proceed.`,
      requestedSchema: {
        type: 'object',
        properties: {
          confirm: {
            type: 'string',
            title: 'Confirm',
            description: 'Type "confirm" to proceed, or anything else to cancel.',
          },
        },
        required: ['confirm'],
      },
    });

    if (result?.action === 'accept' && result.content) {
      return String(result.content.confirm).trim().toLowerCase() === 'confirm';
    }
    return false;
  } catch (err) {
    logger.warn('Elicitation unavailable for confirmation', {
      error: (err as Error).message,
    });
    return null;
  }
}

/**
 * Guard a destructive operation behind confirmation.
 *
 * Returns `null` when the caller may proceed, or a ready-to-return
 * {@link CallToolResult} describing why the operation was aborted (user
 * declined, or confirmation could not be obtained). Callers MUST honor a
 * non-null return by returning it directly without performing the action.
 */
export async function confirmOrAbort(summary: string): Promise<CallToolResult | null> {
  const confirmed = await elicitConfirmation(summary);
  if (confirmed === true) return null;
  if (confirmed === false) {
    return {
      content: [{ type: 'text', text: 'Aborted: not confirmed by the user.' }],
      isError: true,
    };
  }
  return {
    content: [
      {
        type: 'text',
        text:
          'Aborted: this is a destructive action and interactive confirmation ' +
          'is unavailable in this client. No changes were made.',
      },
    ],
    isError: true,
  };
}
