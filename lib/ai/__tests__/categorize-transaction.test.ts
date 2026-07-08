/**
 * Unit tests for categorizeTransaction — the Anthropic SDK is mocked so we can
 * assert how the model's `submit_result` output is normalized into a decision.
 */

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}));

import { categorizeTransaction, type CategoryOption } from '../categorize-transaction';

const categories: CategoryOption[] = [
  { id: 'c-food', name: 'Groceries', group: 'Living' },
  { id: 'c-fun', name: 'Entertainment', group: 'Lifestyle' },
];

function submitResponse(input: unknown, stop = 'tool_use') {
  return {
    stop_reason: stop,
    content: [{ type: 'tool_use', name: 'submit_result', id: 't1', input }],
  };
}

const input = { name: 'Shufersal', amountIls: 120, categories };

describe('categorizeTransaction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the chosen category and clamps confidence', async () => {
    mockCreate.mockResolvedValueOnce(
      submitResponse({ categoryId: 'c-food', confidence: 1.4, reasoning: 'supermarket' })
    );
    const r = await categorizeTransaction('sk-test', input);
    expect(r.categoryId).toBe('c-food');
    expect(r.confidence).toBe(1); // clamped to [0,1]
    expect(r.reasoning).toBe('supermarket');
  });

  it('maps "none" to a null category (no fit)', async () => {
    mockCreate.mockResolvedValueOnce(
      submitResponse({ categoryId: 'none', confidence: 0.2, reasoning: 'unclear' })
    );
    const r = await categorizeTransaction('sk-test', input);
    expect(r.categoryId).toBeNull();
    expect(r.confidence).toBeCloseTo(0.2);
  });

  it('rejects a category id that is not in the provided list', async () => {
    mockCreate.mockResolvedValueOnce(
      submitResponse({ categoryId: 'c-hallucinated', confidence: 0.9, reasoning: 'x' })
    );
    const r = await categorizeTransaction('sk-test', input);
    expect(r.categoryId).toBeNull();
  });

  it('resumes after a paused turn, then reads the decision', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'pause_turn',
        content: [{ type: 'text', text: '...' }],
      })
      .mockResolvedValueOnce(
        submitResponse({ categoryId: 'c-fun', confidence: 0.8, reasoning: 'cinema' })
      );
    const r = await categorizeTransaction('sk-test', input);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(r.categoryId).toBe('c-fun');
  });

  it('gives up gracefully when the model never submits', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'hmm' }],
    });
    const r = await categorizeTransaction('sk-test', input);
    expect(r.categoryId).toBeNull();
    expect(r.confidence).toBe(0);
  });
});
