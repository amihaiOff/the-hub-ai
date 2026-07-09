/**
 * Unit tests for the post-import background categorization pass.
 * The shared helper is mocked — this file only exercises the thin wrapper's
 * contract: it must always resolve (never throw) so the fire-and-forget
 * `after()` caller can't be affected, and it must skip cleanly on a config
 * failure.
 */

jest.mock('@/lib/ai/suggest-categories', () => ({
  suggestCategoriesForHousehold: jest.fn(),
}));

import { suggestCategoriesForHousehold } from '@/lib/ai/suggest-categories';
import { runPostImportSuggestion } from '@/lib/ai/post-import-suggestion';

const mockSuggest = suggestCategoriesForHousehold as jest.MockedFunction<
  typeof suggestCategoriesForHousehold
>;

const emptyCounts = { processed: 0, suggested: 0, lowConfidence: 0, noMatch: 0, errors: 0 };

beforeEach(() => jest.resetAllMocks());

describe('runPostImportSuggestion', () => {
  it('runs a bounded, unattempted-only batch for the household', async () => {
    mockSuggest.mockResolvedValueOnce({ ok: true, counts: emptyCounts });
    await runPostImportSuggestion('hh-1');
    expect(mockSuggest).toHaveBeenCalledTimes(1);
    // Bounded limit so the post-response pass fits under maxDuration,
    // onlyUnattempted so it never re-queries rows the AI already tried, and a
    // wall-clock deadline so it can't overrun the route timeout.
    expect(mockSuggest).toHaveBeenCalledWith(
      'hh-1',
      expect.objectContaining({
        limit: 15,
        onlyUnattempted: true,
        deadlineMs: expect.any(Number),
      })
    );
  });

  it('swallows a thrown error (never rejects to the fire-and-forget caller)', async () => {
    mockSuggest.mockRejectedValueOnce(new Error('anthropic exploded'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runPostImportSuggestion('hh-1')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('skips quietly (logs, does not throw) when the household is misconfigured', async () => {
    mockSuggest.mockResolvedValueOnce({ ok: false, reason: 'no_api_key' });
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    await expect(runPostImportSuggestion('hh-1')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('no_api_key'));
    spy.mockRestore();
  });

  it('skips quietly when there are no categories configured', async () => {
    mockSuggest.mockResolvedValueOnce({ ok: false, reason: 'no_categories' });
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    await expect(runPostImportSuggestion('hh-1')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('no_categories'));
    spy.mockRestore();
  });
});
