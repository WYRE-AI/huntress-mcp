import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetServerRef } = vi.hoisted(() => ({ mockGetServerRef: vi.fn() }));
vi.mock('../../utils/server-ref.js', () => ({ getServerRef: mockGetServerRef }));

import { elicitConfirmation, confirmOrAbort } from '../../elicitation/confirm.js';

describe('elicitConfirmation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when no server is bound', async () => {
    mockGetServerRef.mockReturnValue(null);
    expect(await elicitConfirmation('Do the thing?')).toBeNull();
  });

  it('returns true when the user types "confirm"', async () => {
    const elicitInput = vi.fn().mockResolvedValue({ action: 'accept', content: { confirm: 'confirm' } });
    mockGetServerRef.mockReturnValue({ elicitInput });

    expect(await elicitConfirmation('Do the thing?')).toBe(true);
    expect(elicitInput).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Do the thing?') })
    );
  });

  it('returns false when the user types anything else', async () => {
    const elicitInput = vi.fn().mockResolvedValue({ action: 'accept', content: { confirm: 'nope' } });
    mockGetServerRef.mockReturnValue({ elicitInput });

    expect(await elicitConfirmation('Do the thing?')).toBe(false);
  });

  it('returns false when the user declines/cancels the form', async () => {
    const elicitInput = vi.fn().mockResolvedValue({ action: 'cancel' });
    mockGetServerRef.mockReturnValue({ elicitInput });

    expect(await elicitConfirmation('Do the thing?')).toBe(false);
  });

  it('returns null when elicitInput throws (client does not support elicitation)', async () => {
    const elicitInput = vi.fn().mockRejectedValue(new Error('not supported'));
    mockGetServerRef.mockReturnValue({ elicitInput });

    expect(await elicitConfirmation('Do the thing?')).toBeNull();
  });
});

describe('confirmOrAbort', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null (proceed) when confirmed', async () => {
    const elicitInput = vi.fn().mockResolvedValue({ action: 'accept', content: { confirm: 'confirm' } });
    mockGetServerRef.mockReturnValue({ elicitInput });

    expect(await confirmOrAbort('Do the thing?')).toBeNull();
  });

  it('returns an isError abort result when declined', async () => {
    const elicitInput = vi.fn().mockResolvedValue({ action: 'accept', content: { confirm: 'no' } });
    mockGetServerRef.mockReturnValue({ elicitInput });

    const result = await confirmOrAbort('Do the thing?');
    expect(result?.isError).toBe(true);
    expect(result?.content[0].text).toBe('Aborted: not confirmed by the user.');
  });

  it('returns an isError abort result when elicitation is unavailable, refusing by default', async () => {
    mockGetServerRef.mockReturnValue(null);

    const result = await confirmOrAbort('Do the thing?');
    expect(result?.isError).toBe(true);
    expect(result?.content[0].text).toContain('interactive confirmation');
  });
});
