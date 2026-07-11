/**
 * Unit tests for the post-response background categorization passes.
 * The shared helper is mocked — these only exercise the thin wrappers'
 * contract: always resolve (never throw) so the fire-and-forget `after()`
 * caller can't be affected, pass bounded/unattempted-only args, and skip
 * cleanly on a config failure.
 */

jest.mock('@/lib/ai/suggest-categories', () => ({
  suggestCategoriesForHousehold: jest.fn(),
}));

import { suggestCategoriesForHousehold } from '@/lib/ai/suggest-categories';
import {
  runPostImportSuggestion,
  runReadTriggeredSuggestion,
} from '@/lib/ai/background-suggestion';

const mockSuggest = suggestCategoriesForHousehold as jest.MockedFunction<
  typeof suggestCategoriesForHousehold
>;

const emptyCounts = { processed: 0, suggested: 0, lowConfidence: 0, noMatch: 0, errors: 0 };

beforeEach(() => jest.resetAllMocks());

describe.each([
  ['runPostImportSuggestion', runPostImportSuggestion],
  ['runReadTriggeredSuggestion', runReadTriggeredSuggestion],
] as const)('%s', (_name, run) => {
  it('runs a bounded, unattempted-only, deadline-bounded batch for the household', async () => {
    mockSuggest.mockResolvedValueOnce({ ok: true, counts: emptyCounts });
    await run('hh-1');
    expect(mockSuggest).toHaveBeenCalledTimes(1);
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
    await expect(run('hh-1')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('skips quietly (logs, does not throw) when the household is misconfigured', async () => {
    mockSuggest.mockResolvedValueOnce({ ok: false, reason: 'no_api_key' });
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    await expect(run('hh-1')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('no_api_key'));
    spy.mockRestore();
  });
});
