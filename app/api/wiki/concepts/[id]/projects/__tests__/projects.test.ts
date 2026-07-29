/**
 * Integration tests for the wiki source↔project membership routes:
 *   POST   /api/wiki/concepts/[id]/projects
 *   DELETE /api/wiki/concepts/[id]/projects/[projectId]
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    wikiConcept: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    wikiConceptProject: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { POST } from '../route';
import { DELETE } from '../[projectId]/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
};

const PROJECT_ID = 'cproject000000000000000000';
const postParams = (id: string) => ({ params: Promise.resolve({ id }) });
const delParams = (id: string, projectId: string) => ({
  params: Promise.resolve({ id, projectId }),
});

function post(id: string, body: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/wiki/concepts/${id}/projects`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    postParams(id)
  );
}

describe('POST /api/wiki/concepts/[id]/projects', () => {
  beforeEach(() => jest.resetAllMocks());

  it('401s when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await post('s1', { projectId: PROJECT_ID });
    expect(res.status).toBe(401);
    expect(mockPrisma.wikiConceptProject.upsert).not.toHaveBeenCalled();
  });

  it('400s on an invalid projectId', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    const res = await post('s1', { projectId: 'not-a-cuid' });
    expect(res.status).toBe(400);
    expect(mockPrisma.wikiConceptProject.upsert).not.toHaveBeenCalled();
  });

  it('404s when the source is not in the household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.wikiConcept.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // source
      .mockResolvedValueOnce({ id: PROJECT_ID }); // project
    const res = await post('s1', { projectId: PROJECT_ID });
    expect(res.status).toBe(404);
    expect(mockPrisma.wikiConceptProject.upsert).not.toHaveBeenCalled();
  });

  it('400s when trying to file a project under a project', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.wikiConcept.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: 's1', type: 'Project' }) // source is a Project
      .mockResolvedValueOnce({ id: PROJECT_ID });
    const res = await post('s1', { projectId: PROJECT_ID });
    expect(res.status).toBe(400);
    expect(mockPrisma.wikiConceptProject.upsert).not.toHaveBeenCalled();
  });

  it('400s when the target project does not exist', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.wikiConcept.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: 's1', type: 'Source' })
      .mockResolvedValueOnce(null); // project missing
    const res = await post('s1', { projectId: PROJECT_ID });
    expect(res.status).toBe(400);
    expect(mockPrisma.wikiConceptProject.upsert).not.toHaveBeenCalled();
  });

  it('upserts the membership idempotently on success', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.wikiConcept.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: 's1', type: 'Source' })
      .mockResolvedValueOnce({ id: PROJECT_ID });
    (mockPrisma.wikiConceptProject.upsert as jest.Mock).mockResolvedValueOnce({ id: 'm1' });
    const res = await post('s1', { projectId: PROJECT_ID });
    expect(res.status).toBe(200);
    const call = (mockPrisma.wikiConceptProject.upsert as jest.Mock).mock.calls[0][0];
    expect(call.where.sourceId_projectId).toEqual({ sourceId: 's1', projectId: PROJECT_ID });
    expect(call.create).toEqual({ sourceId: 's1', projectId: PROJECT_ID });
  });
});

describe('DELETE /api/wiki/concepts/[id]/projects/[projectId]', () => {
  beforeEach(() => jest.resetAllMocks());

  function del(id: string, projectId: string) {
    return DELETE(
      new NextRequest(`http://localhost/api/wiki/concepts/${id}/projects/${projectId}`, {
        method: 'DELETE',
      }),
      delParams(id, projectId)
    );
  }

  it('401s when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await del('s1', PROJECT_ID);
    expect(res.status).toBe(401);
    expect(mockPrisma.wikiConceptProject.deleteMany).not.toHaveBeenCalled();
  });

  it('removes the membership and clears the legacy pointer when it matched', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.wikiConceptProject.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    (mockPrisma.wikiConcept.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    const res = await del('s1', PROJECT_ID);
    expect(res.status).toBe(200);
    // Scoped to the caller's household to prevent IDOR.
    const call = (mockPrisma.wikiConceptProject.deleteMany as jest.Mock).mock.calls[0][0];
    expect(call.where.sourceId).toBe('s1');
    expect(call.where.projectId).toBe(PROJECT_ID);
    expect(call.where.source.householdId).toBe('hh-1');
    expect(mockPrisma.wikiConcept.updateMany).toHaveBeenCalled();
  });

  it('is a no-op (no legacy clear) when nothing matched', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.wikiConceptProject.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    const res = await del('s1', PROJECT_ID);
    expect(res.status).toBe(200);
    expect(mockPrisma.wikiConcept.updateMany).not.toHaveBeenCalled();
  });
});
