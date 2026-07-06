/**
 * Seeds a batch of realistic mock tasks into the local database so the
 * redesigned Tasks page has something to render.
 *
 * Usage (local only — this script deliberately refuses non-localhost DBs):
 *   DATABASE_URL="postgresql://amihaio@localhost:5432/hub_ai" \
 *     npx tsx scripts/seed-mock-tasks.ts
 *
 * What it does:
 *   1. Picks the first household + first user in that household.
 *   2. Creates 4 task categories (Work, Personal, Side Project, Health)
 *      if they don't already exist.
 *   3. Creates 3 tags (Engineering, Critical, Follow-up).
 *   4. Inserts ~12 tasks spanning every status and priority, some with
 *      sub-tasks, notes, categories, and tags — enough surface area to
 *      exercise the List / Kanban / Table views.
 */

import { PrismaClient, TaskStatus, TaskPriority } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: DATABASE_URL is required');
  process.exit(1);
}
if (!connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')) {
  console.error(
    'ERROR: refusing to run — DATABASE_URL is not localhost. This script only seeds local DBs.'
  );
  console.error('Host detected:', connectionString.match(/@([^/:]+)/)?.[1]);
  process.exit(1);
}

// Prisma 7 requires an explicit driver adapter — mirroring the pattern used
// by our other one-off scripts (scripts/cleanup-dev-profile.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaPg } = require('@prisma/adapter-pg');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Pool } = require('pg');
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function main() {
  const household = await prisma.household.findFirst({
    include: {
      members: {
        include: { profile: { include: { user: true } } },
        take: 5,
      },
    },
  });
  if (!household) {
    console.error('ERROR: no household found. Log in once, then re-run.');
    process.exit(1);
  }
  const owner = household.members.map((m) => m.profile.user).find((u) => u != null);
  if (!owner) {
    console.error('ERROR: no household member has a linked User row. Log in once, then re-run.');
    process.exit(1);
  }
  console.log(`Seeding tasks into household "${household.name}" for user ${owner.email}`);

  // Categories — idempotent via the (householdId, name) unique index.
  const categoryDefs = [
    { name: 'Work', color: '#3b82f6' },
    { name: 'Personal', color: '#10b981' },
    { name: 'Side Project', color: '#a855f7' },
    { name: 'Health', color: '#ef4444' },
  ];
  const categories: Record<string, string> = {};
  for (const [i, def] of categoryDefs.entries()) {
    const row = await prisma.taskCategory.upsert({
      where: { householdId_name: { householdId: household.id, name: def.name } },
      update: {},
      create: {
        name: def.name,
        color: def.color,
        sortOrder: i,
        householdId: household.id,
      },
    });
    categories[def.name] = row.id;
  }

  // Tags — same idempotency pattern.
  const tagDefs = [
    { name: 'Engineering', color: '#3b82f6' },
    { name: 'Critical', color: '#ef4444' },
    { name: 'Follow-up', color: '#f59e0b' },
  ];
  const tags: Record<string, string> = {};
  for (const def of tagDefs) {
    const row = await prisma.taskTag.upsert({
      where: { householdId_name: { householdId: household.id, name: def.name } },
      update: {},
      create: { name: def.name, color: def.color, householdId: household.id },
    });
    tags[def.name] = row.id;
  }

  // Wipe any previously-seeded mock tasks (they share the `[mock]` marker
  // in notes so we don't nuke real user data). This keeps the script
  // repeatable without duplicating rows every run.
  const purged = await prisma.task.deleteMany({
    where: { householdId: household.id, notes: { contains: '[mock]' } },
  });
  console.log(`Cleared ${purged.count} previously-seeded mock tasks`);

  const tasksToCreate: Array<{
    title: string;
    notes?: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate?: Date | null;
    categoryName?: keyof typeof categories | string;
    tagNames?: string[];
    subtasks?: Array<{ title: string; status?: TaskStatus }>;
  }> = [
    {
      title: 'Review Q3 Marketing Strategy',
      status: 'TODO',
      priority: 'HIGH',
      dueDate: daysFromNow(3),
      categoryName: 'Work',
      tagNames: ['Follow-up'],
      notes:
        '[mock] Read through the Q3 deck and leave comments on the growth-loop slide before Thursday sync.',
    },
    {
      title: 'Database Migration Prep',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      dueDate: daysFromNow(5),
      categoryName: 'Work',
      tagNames: ['Engineering', 'Critical'],
      notes:
        '[mock] Cutover from Legacy-A to Cloud-Native-X. Audit is complete; next up is the shadow-read window.',
      subtasks: [
        { title: 'Draft the rollback runbook', status: 'DONE' },
        { title: 'Schedule the read-only window with support', status: 'IN_PROGRESS' },
        { title: 'Sanity-check row counts on staging' },
      ],
    },
    {
      title: 'Onboarding Flow Redesign',
      status: 'DONE',
      priority: 'LOW',
      dueDate: daysFromNow(-4),
      categoryName: 'Side Project',
      notes: '[mock] Ship the two-step signup variant. QA passed on Tuesday.',
    },
    {
      title: 'Q4 Revenue Projections',
      status: 'TODO',
      priority: 'HIGH',
      dueDate: daysFromNow(7),
      categoryName: 'Work',
      tagNames: ['Critical'],
      notes: '[mock] Update the financial model with new conversion data from the marketing pilot.',
    },
    {
      title: 'User Persona Research',
      status: 'TODO',
      priority: 'MEDIUM',
      dueDate: daysFromNow(10),
      categoryName: 'Side Project',
      notes:
        '[mock] Synthesize the six interviews from last sprint into two primary personas + one edge-case persona.',
    },
    {
      title: 'Book annual physical',
      status: 'TODO',
      priority: 'LOW',
      dueDate: daysFromNow(14),
      categoryName: 'Health',
      notes: '[mock] Call the clinic; last visit was a year ago.',
    },
    {
      title: 'Workout streak',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      dueDate: null,
      categoryName: 'Health',
      notes: '[mock] 65% complete for the month — three more sessions to hit the goal.',
    },
    {
      title: 'Draft Client Agreement',
      status: 'DONE',
      priority: 'LOW',
      dueDate: daysFromNow(-2),
      categoryName: 'Work',
      notes: '[mock] Sent to legal for redlines. Waiting on their pass.',
    },
    {
      title: 'Infrastructure Maintenance',
      status: 'BLOCKED',
      priority: 'URGENT',
      dueDate: daysFromNow(1),
      categoryName: 'Work',
      tagNames: ['Engineering', 'Critical'],
      notes:
        '[mock] Blocked on the security review — waiting for a green light from the platform team.',
    },
    {
      title: 'User Testing Feedback Analysis',
      status: 'TODO',
      priority: 'MEDIUM',
      dueDate: daysFromNow(6),
      categoryName: 'Side Project',
      tagNames: ['Follow-up'],
      notes: '[mock] Tag the recordings and pull recurring pain points into a summary doc.',
    },
    {
      title: 'Plan weekend hike',
      status: 'TODO',
      priority: 'LOW',
      dueDate: daysFromNow(4),
      categoryName: 'Personal',
      notes: '[mock] Pick a trail, check the weather, share the plan with the group.',
    },
    {
      title: 'Q3 Product Strategy Deck',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      dueDate: daysFromNow(2),
      categoryName: 'Work',
      tagNames: ['Follow-up'],
      notes: '[mock] Working draft in Figma; needs a narrative pass before Friday.',
    },
  ];

  let taskCount = 0;
  let subtaskCount = 0;
  for (const def of tasksToCreate) {
    const parent = await prisma.task.create({
      data: {
        title: def.title,
        notes: def.notes ?? null,
        status: def.status,
        priority: def.priority,
        dueDate: def.dueDate ?? null,
        categoryId: def.categoryName ? (categories[def.categoryName] ?? null) : null,
        ownerId: owner.id,
        householdId: household.id,
        tags:
          def.tagNames && def.tagNames.length
            ? { connect: def.tagNames.map((n) => ({ id: tags[n]! })) }
            : undefined,
      },
    });
    taskCount++;

    for (const [i, sub] of (def.subtasks ?? []).entries()) {
      await prisma.task.create({
        data: {
          title: sub.title,
          notes: '[mock] child task',
          status: sub.status ?? 'TODO',
          priority: 'MEDIUM',
          ownerId: owner.id,
          householdId: household.id,
          parentTaskId: parent.id,
          sortOrder: i,
        },
      });
      subtaskCount++;
    }
  }

  console.log(`Created ${taskCount} parent tasks and ${subtaskCount} sub-tasks`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
