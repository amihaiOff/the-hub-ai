import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createTaskSchema, taskFiltersSchema, updateTaskSchema } from '@/lib/validations/tasks';
import { updateTransactionSchema } from '@/lib/validations/budget';
import * as assets from '@/lib/validations/assets';
import * as budget from '@/lib/validations/budget';
import * as common from '@/lib/validations/common';
import * as favorites from '@/lib/validations/favorites';
import * as habits from '@/lib/validations/habits';
import * as pageOps from '@/lib/validations/page-ops';
import * as pages from '@/lib/validations/pages';
import * as pension from '@/lib/validations/pension';
import * as portfolio from '@/lib/validations/portfolio';
import * as shopping from '@/lib/validations/shopping';
import * as tasks from '@/lib/validations/tasks';
import catalog from './catalog.json';
import type { CatalogAction } from './build-catalog';

/**
 * The Hub MCP server. Every tool is a thin call into the app's own HTTP API
 * (as the signed-in user), so validation, household scoping, section limits
 * and the MCP block list (lib/mcp/blocked.ts, enforced in proxy.ts) all apply.
 *
 * Two layers: a few curated tools for the everyday asks (budget, tasks, net
 * worth), plus list_app_actions / call_app_action for everything else, so
 * the tool list Claude loads stays short (progressive disclosure).
 */

export interface ApiResult {
  ok: boolean;
  status: number;
  text: string;
}
export type ApiCaller = (
  method: string,
  path: string,
  opts?: { query?: Record<string, unknown>; body?: unknown }
) => Promise<ApiResult>;

const ACTIONS = catalog as CatalogAction[];
const VALIDATION_MODULES: Record<string, Record<string, unknown>> = {
  assets,
  budget,
  common,
  favorites,
  habits,
  'page-ops': pageOps,
  pages,
  pension,
  portfolio,
  shopping,
  tasks,
};

/** ponytail: hard cut at 60k chars; add paging per tool if a real answer needs more. */
const MAX_RESULT_CHARS = 60_000;

function toResult({ ok, status, text }: ApiResult) {
  const body =
    text.length > MAX_RESULT_CHARS
      ? `${text.slice(0, MAX_RESULT_CHARS)}\n…[truncated ${text.length - MAX_RESULT_CHARS} chars — narrow the request]`
      : text;
  return {
    content: [{ type: 'text' as const, text: ok ? body : `HTTP ${status}: ${body}` }],
    isError: !ok,
  };
}

/** JSON Schema of an action's request body, when its route uses a lib/validations schema. */
export function bodyJsonSchema(action: CatalogAction): unknown {
  if (!action.body) return undefined;
  const schema = VALIDATION_MODULES[action.body.module]?.[action.body.schema];
  if (!(schema instanceof z.ZodType)) return undefined;
  try {
    return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  } catch {
    return undefined;
  }
}

/** The catalog action a concrete method + path resolves to, if any. */
export function findAction(method: string, path: string): CatalogAction | undefined {
  const m = method.toUpperCase();
  return ACTIONS.find((a) => {
    if (a.method !== m) return false;
    // Placeholders take id-like values only — no '\\', '%', '?', '#' or '..' that
    // URL parsing could turn into a different route.
    const re = new RegExp(
      '^' + a.path.replace(/\{[^}]+\}/g, '(?!\\.+(?:/|$))[A-Za-z0-9_.-]+') + '$'
    );
    return re.test(path);
  });
}

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM');
const idSchema = z.string().min(1);

export function createHubMcpServer(api: ApiCaller): McpServer {
  const server = new McpServer({ name: 'the-hub', version: '1.0.0' });
  const get = (path: string, query?: Record<string, unknown>) =>
    api('GET', path, { query }).then(toResult);

  // ── Budget ────────────────────────────────────────────────────────────
  server.registerTool(
    'get_budget_summary',
    {
      description:
        'Budget for one month: income, spending and budget vs. actual per category and group. Months are billing-cycle months (YYYY-MM).',
      inputSchema: { month: monthSchema },
      annotations: { readOnlyHint: true },
    },
    ({ month }) => get('/api/budget/summary', { month })
  );

  server.registerTool(
    'search_transactions',
    {
      description:
        'List budget transactions, newest first. Filter by month (YYYY-MM) or date range, category, payee, type, or uncategorized. Use list_budget_categories for category ids.',
      inputSchema: {
        month: monthSchema.optional(),
        startDate: z.string().optional().describe('YYYY-MM-DD'),
        endDate: z.string().optional().describe('YYYY-MM-DD'),
        type: z.enum(['income', 'expense']).optional(),
        categoryId: z.string().optional(),
        payeeId: z.string().optional(),
        uncategorized: z.boolean().optional(),
        limit: z.number().int().positive().max(500).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => get('/api/budget/transactions', args)
  );

  server.registerTool(
    'update_transaction',
    {
      description:
        'Change one transaction — e.g. set its categoryId to recategorize it, edit notes, tags or amount. Only send the fields to change.',
      inputSchema: { id: idSchema, ...updateTransactionSchema.shape },
    },
    ({ id, ...body }) =>
      api('PUT', `/api/budget/transactions/${encodeURIComponent(id)}`, { body }).then(toResult)
  );

  server.registerTool(
    'list_budget_categories',
    {
      description: 'All budget categories (with ids, groups and monthly budgets).',
      annotations: { readOnlyHint: true },
    },
    () => get('/api/budget/categories')
  );

  server.registerTool(
    'get_budget_report',
    {
      description:
        'The written monthly budget report for a month (YYYY-MM). Omit month to list which months have a report.',
      inputSchema: { month: monthSchema.optional() },
      annotations: { readOnlyHint: true },
    },
    ({ month }) => get(month ? `/api/budget/reports/${month}` : '/api/budget/reports')
  );

  // ── Tasks ─────────────────────────────────────────────────────────────
  server.registerTool(
    'list_tasks',
    {
      description:
        'List tasks, optionally filtered (search text, status, priority, type, category, assignee, tag). Each task has a `done` flag.',
      inputSchema: taskFiltersSchema.shape,
      annotations: { readOnlyHint: true },
    },
    (args) => get('/api/tasks', args)
  );

  server.registerTool(
    'create_task',
    {
      description:
        'Add a task. Only title is required. Use list_task_categories_and_tags for category/tag ids. dueDate is ISO 8601 with offset.',
      inputSchema: createTaskSchema.shape,
    },
    (body) => api('POST', '/api/tasks', { body }).then(toResult)
  );

  server.registerTool(
    'update_task',
    {
      description:
        'Edit a task — send only the fields to change. Set done: true to complete it (done: false to reopen).',
      inputSchema: { id: idSchema, ...updateTaskSchema.shape },
    },
    ({ id, ...body }) =>
      api('PATCH', `/api/tasks/${encodeURIComponent(id)}`, { body }).then(toResult)
  );

  server.registerTool(
    'list_task_categories_and_tags',
    {
      description: 'Task categories and tags, with their ids.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const [cats, tags] = await Promise.all([
        api('GET', '/api/task-categories'),
        api('GET', '/api/task-tags'),
      ]);
      return toResult({
        ok: cats.ok && tags.ok,
        status: cats.ok ? tags.status : cats.status,
        text: `{"categories":${cats.text},"tags":${tags.text}}`,
      });
    }
  );

  // ── Overview ──────────────────────────────────────────────────────────
  server.registerTool(
    'get_net_worth',
    {
      description:
        'Dashboard overview: current net worth and its breakdown (stocks, pension, assets, debt).',
      annotations: { readOnlyHint: true },
    },
    () => get('/api/dashboard')
  );

  // ── Everything else ───────────────────────────────────────────────────
  const areas = [...new Set(ACTIONS.map((a) => a.area))].sort();
  server.registerTool(
    'list_app_actions',
    {
      description: `Everything else in The Hub (shopping, habits, Areas pages, pension, portfolio, assets, insurance, wiki, settings, budget admin, …). Call with an area to see its actions — method, path, what it does, query params and body JSON schema — then run one with call_app_action. Areas: ${areas.join(', ')}.`,
      inputSchema: { area: z.enum(areas as [string, ...string[]]) },
      annotations: { readOnlyHint: true },
    },
    ({ area }) => {
      const list = ACTIONS.filter((a) => a.area === area).map((a) => ({
        method: a.method,
        path: a.path,
        summary: a.summary,
        query: a.query,
        body: bodyJsonSchema(a),
      }));
      return toResult({ ok: true, status: 200, text: JSON.stringify(list) });
    }
  );

  server.registerTool(
    'call_app_action',
    {
      description:
        'Run one action from list_app_actions. Fill {placeholders} in the path with real ids. Errors come back with the reason so you can fix the input and retry.',
      inputSchema: {
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
        path: z.string().startsWith('/api/'),
        query: z.record(z.string(), z.unknown()).optional(),
        body: z.unknown().optional(),
      },
    },
    ({ method, path, query, body }) => {
      if (!findAction(method, path)) {
        return toResult({
          ok: false,
          status: 404,
          text: `No action ${method} ${path}. Use list_app_actions to see what exists.`,
        });
      }
      return api(method, path, { query, body }).then(toResult);
    }
  );

  return server;
}
