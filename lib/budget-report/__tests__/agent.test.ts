import type Anthropic from '@anthropic-ai/sdk';
import { runReportAgent, type AgentState, type ReportContent } from '../agent';

const REPORT: ReportContent = {
  headline: 'Calm month',
  summary: 'Spending was down.',
  cards: [{ tone: 'positive', title: 'Wolt down', figure: '₪1,212', body: 'Fewer orders.' }],
  deepDives: [],
  duplicates: [],
  budgetFit: [],
  statsCorrections: [],
  method: 'Checked with pandas.',
};

const usage = {
  input_tokens: 10,
  output_tokens: 5,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

function message(stop_reason: string, content: unknown[]) {
  return {
    stop_reason,
    content,
    usage,
    container: { id: 'cont_1' },
  } as unknown as Anthropic.Message;
}

function fakeClient(responses: (Anthropic.Message | Error)[]) {
  const calls: Anthropic.MessageParam[][] = [];
  const client = {
    messages: {
      stream: jest.fn((params: { messages: Anthropic.MessageParam[] }) => {
        calls.push(JSON.parse(JSON.stringify(params.messages)));
        const next = responses.shift()!;
        return {
          finalMessage: () =>
            next instanceof Error ? Promise.reject(next) : Promise.resolve(next),
        };
      }),
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const start: AgentState = {
  messages: [{ role: 'user', content: 'Write the report.' }],
  containerId: null,
  fileIds: ['file_1'],
};
const later = () => Date.now() + 200_000;

describe('runReportAgent', () => {
  it('finishes when the agent submits a valid report', async () => {
    const { client } = fakeClient([
      message('pause_turn', [{ type: 'text', text: 'analysing' }]),
      message('tool_use', [{ type: 'tool_use', id: 'tu1', name: 'submit_report', input: REPORT }]),
    ]);
    const r = await runReportAgent({
      client,
      system: 's',
      state: start,
      turnCutoffAt: later(),
      deadlineAt: later(),
      finalRun: false,
    });
    expect(r.status).toBe('done');
    expect(r.report).toEqual(REPORT);
    expect(r.state.containerId).toBe('cont_1');
    expect(r.usage.inputTokens).toBe(20);
  });

  it('pauses without calling the model once the turn cutoff has passed, keeping the conversation', async () => {
    const { client } = fakeClient([]);
    const r = await runReportAgent({
      client,
      system: 's',
      state: start,
      turnCutoffAt: Date.now() - 1,
      deadlineAt: later(),
      finalRun: false,
    });
    expect(r.status).toBe('paused');
    expect(r.state.messages).toEqual(start.messages);
  });

  it('resumes by appending to the saved conversation unchanged', async () => {
    const saved: AgentState = {
      ...start,
      containerId: 'cont_1',
      messages: [
        ...start.messages,
        { role: 'assistant', content: [{ type: 'text', text: 'step 1' }] },
      ],
    };
    const { client, calls } = fakeClient([
      message('tool_use', [{ type: 'tool_use', id: 'tu1', name: 'submit_report', input: REPORT }]),
    ]);
    await runReportAgent({
      client,
      system: 's',
      state: saved,
      turnCutoffAt: later(),
      deadlineAt: later(),
      finalRun: false,
    });
    expect(calls[0]).toEqual(saved.messages);
  });

  it('tells the agent to submit on the final run', async () => {
    const { client, calls } = fakeClient([
      message('tool_use', [{ type: 'tool_use', id: 'tu1', name: 'submit_report', input: REPORT }]),
    ]);
    await runReportAgent({
      client,
      system: 's',
      state: start,
      turnCutoffAt: later(),
      deadlineAt: later(),
      finalRun: true,
    });
    expect(calls[0].at(-1)).toEqual({
      role: 'user',
      content: expect.stringContaining('Time is up'),
    });
  });

  it('returns an invalid submission as a tool error and accepts the corrected one', async () => {
    const { client, calls } = fakeClient([
      message('tool_use', [
        { type: 'tool_use', id: 'tu1', name: 'submit_report', input: { headline: 'x' } },
      ]),
      message('tool_use', [{ type: 'tool_use', id: 'tu2', name: 'submit_report', input: REPORT }]),
    ]);
    const r = await runReportAgent({
      client,
      system: 's',
      state: start,
      turnCutoffAt: later(),
      deadlineAt: later(),
      finalRun: false,
    });
    expect(r.status).toBe('done');
    expect(calls[1].at(-1)).toEqual({
      role: 'user',
      content: [
        expect.objectContaining({ type: 'tool_result', tool_use_id: 'tu1', is_error: true }),
      ],
    });
  });

  it('fails after repeated turns without a submission', async () => {
    const { client } = fakeClient([
      message('end_turn', [{ type: 'text', text: 'done?' }]),
      message('end_turn', [{ type: 'text', text: 'done?' }]),
      message('end_turn', [{ type: 'text', text: 'done?' }]),
    ]);
    const r = await runReportAgent({
      client,
      system: 's',
      state: start,
      turnCutoffAt: later(),
      deadlineAt: later(),
      finalRun: false,
    });
    expect(r.status).toBe('failed');
  });

  it('pauses (keeping earlier turns) when the deadline aborts a streaming turn', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    const { client } = fakeClient([
      message('pause_turn', [{ type: 'text', text: 'step 1' }]),
      abort,
    ]);
    const r = await runReportAgent({
      client,
      system: 's',
      state: start,
      turnCutoffAt: later(),
      deadlineAt: later(),
      finalRun: false,
    });
    expect(r.status).toBe('paused');
    expect(r.state.messages).toHaveLength(2);
  });

  it('reports each completed turn so progress can be saved', async () => {
    const onTurn = jest.fn().mockResolvedValue(undefined);
    const { client } = fakeClient([
      message('pause_turn', [{ type: 'text', text: 'step 1' }]),
      message('tool_use', [{ type: 'tool_use', id: 'tu1', name: 'submit_report', input: REPORT }]),
    ]);
    await runReportAgent({
      client,
      system: 's',
      state: start,
      turnCutoffAt: later(),
      deadlineAt: later(),
      finalRun: false,
      onTurn,
    });
    expect(onTurn).toHaveBeenCalledTimes(1);
    expect(onTurn.mock.calls[0][0].messages).toHaveLength(2);
  });

  it('fails on an API error that is not a timeout', async () => {
    const { client } = fakeClient([new Error('bad request')]);
    const r = await runReportAgent({
      client,
      system: 's',
      state: start,
      turnCutoffAt: later(),
      deadlineAt: later(),
      finalRun: false,
    });
    expect(r).toEqual(expect.objectContaining({ status: 'failed', error: 'bad request' }));
  });
});
