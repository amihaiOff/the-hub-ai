import { bodyJsonSchema, findAction } from '../server';
import catalog from '../catalog.json';
import type { CatalogAction } from '../build-catalog';

describe('findAction', () => {
  it('matches placeholders against concrete ids', () => {
    expect(findAction('PATCH', '/api/tasks/abc123')).toMatchObject({
      method: 'PATCH',
      path: '/api/tasks/{id}',
    });
    expect(findAction('get', '/api/assets/items/a1/owners')).toMatchObject({
      path: '/api/assets/items/{id}/owners',
    });
  });

  it('does not let a placeholder span multiple segments', () => {
    expect(findAction('PATCH', '/api/tasks/a/b')).toBeUndefined();
    expect(findAction('PATCH', '/api/tasks/')).toBeUndefined();
  });

  it.each([
    '/api/tasks/..',
    '/api/tasks/.',
    '/api/tasks/..%5Cbackup',
    '/api/tasks/..\\backup',
    '/api/tasks/a%2Fb',
    '/api/tasks/a?x=1',
    '/api/tasks/a#b',
    '/api/tasks/a b',
  ])('rejects placeholder values URL parsing could reroute: %s', (p) => {
    expect(findAction('PATCH', p)).toBeUndefined();
  });

  it('accepts id-like values containing dots, dashes and underscores', () => {
    expect(findAction('PATCH', '/api/tasks/cl.x-1_Z')).toBeDefined();
    expect(findAction('PATCH', '/api/tasks/...a')).toBeDefined();
  });

  it('rejects unknown paths and methods', () => {
    expect(findAction('GET', '/api/nope')).toBeUndefined();
    expect(findAction('PUT', '/api/tasks')).toBeUndefined();
  });

  it.each([
    ['DELETE', '/api/pages/p1'],
    ['DELETE', '/api/pages/sections/s1'],
    ['POST', '/api/restore'],
    ['DELETE', '/api/households/h1'],
    ['DELETE', '/api/households/h1/members/m1'],
    ['PATCH', '/api/households/h1/members/m1'],
    ['POST', '/api/households/h1/invites'],
    ['POST', '/api/pages/p1/share'],
    ['GET', '/api/settings/anthropic-key'],
    ['GET', '/api/backup'],
    ['GET', '/api/cron/update-stock-prices'],
    ['GET', '/api/agent/backlog'],
    ['POST', '/api/mcp'],
  ])('rejects blocked / excluded %s %s', (m, p) => {
    expect(findAction(m, p)).toBeUndefined();
  });
});

describe('bodyJsonSchema', () => {
  it('returns undefined when the action has no body schema', () => {
    expect(bodyJsonSchema({ method: 'GET', path: '/api/x', area: 'x' })).toBeUndefined();
  });

  it('returns undefined for an unknown module or schema', () => {
    expect(
      bodyJsonSchema({
        method: 'POST',
        path: '/x',
        area: 'x',
        body: { module: 'nope', schema: 'a' },
      })
    ).toBeUndefined();
    expect(
      bodyJsonSchema({
        method: 'POST',
        path: '/x',
        area: 'x',
        body: { module: 'tasks', schema: 'notASchema' },
      })
    ).toBeUndefined();
  });

  it('converts a real validation schema to JSON Schema', () => {
    const action = findAction('POST', '/api/tasks')!;
    expect(action.body).toBeDefined();
    const schema = bodyJsonSchema(action) as {
      type?: string;
      properties?: Record<string, unknown>;
    };
    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('title');
  });

  it('every catalog body reference resolves to a JSON Schema', () => {
    const unresolved = (catalog as CatalogAction[])
      .filter((a) => a.body && bodyJsonSchema(a) === undefined)
      .map((a) => `${a.method} ${a.path} (${a.body!.module}.${a.body!.schema})`);
    expect(unresolved).toEqual([]);
  });
});
