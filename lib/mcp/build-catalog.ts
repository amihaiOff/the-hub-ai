import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { BLOCKED_AREAS, mcpBlockReason } from './blocked';

/**
 * Builds the "app actions" catalog the MCP catch-all tools serve, by reading
 * every app/api/** /route.ts: its path, exported HTTP methods, the JSDoc above
 * each handler, the query params it reads, and the lib/validations schema it
 * parses the body with. Run `npm run mcp:catalog` after changing API routes;
 * a unit test fails while lib/mcp/catalog.json is stale.
 */

export interface CatalogAction {
  method: string;
  path: string;
  area: string;
  summary?: string;
  query?: string[];
  body?: { module: string; schema: string };
}

/** Blocked areas plus auth plumbing / public share views / MCP itself. */
const EXCLUDED_AREAS = new Set([...BLOCKED_AREAS, 'auth', 'mcp', 'share']);

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === '__tests__') return [];
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

function jsdocBefore(src: string, index: number): string | undefined {
  const before = src.slice(0, index).trimEnd();
  if (!before.endsWith('*/')) return undefined;
  const start = before.lastIndexOf('/**');
  if (start < 0) return undefined;
  const text = before
    .slice(start + 3, -2)
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .join('\n')
    .split(/\n\s*\n/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, 300) : undefined;
}

export function buildCatalog(rootDir: string): CatalogAction[] {
  const apiDir = join(rootDir, 'app', 'api');
  const actions: CatalogAction[] = [];

  for (const file of routeFiles(apiDir).sort()) {
    const segments = relative(apiDir, file).split(sep).slice(0, -1);
    const area = segments[0];
    if (!area || EXCLUDED_AREAS.has(area)) continue;
    const path =
      '/api/' + segments.map((s) => s.replace(/^\[(?:\.\.\.)?(.+)\]$/, '{$1}')).join('/');
    const src = readFileSync(file, 'utf8');

    const exportRe = new RegExp(
      `export\\s+(?:async\\s+)?function\\s+(${METHODS.join('|')})\\b`,
      'g'
    );
    const found = [...src.matchAll(exportRe)];
    found.forEach((m, i) => {
      const method = m[1];
      const samplePath = path.replace(/\{[^}]+\}/g, 'x');
      if (mcpBlockReason(method, samplePath)) return;

      const handler = src.slice(m.index, found[i + 1]?.index ?? src.length);
      const action: CatalogAction = { method, path, area };
      const summary = jsdocBefore(src, m.index!);
      if (summary) action.summary = summary;

      const query = [
        ...new Set([...handler.matchAll(/searchParams\.get\('([^']+)'\)/g)].map((q) => q[1])),
      ];
      if (query.length) action.query = query;

      const schema = handler.match(/\b(\w+Schema)\.(?:safeParse|parse)\(/)?.[1];
      if (schema) {
        const imp = src.match(
          new RegExp(
            `import\\s*\\{[^}]*\\b${schema}\\b[^}]*\\}\\s*from\\s*'@/lib/validations/([\\w-]+)'`
          )
        );
        if (imp) action.body = { module: imp[1], schema };
      }
      actions.push(action);
    });
  }
  return actions;
}
