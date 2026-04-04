import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/test-neon-compat
 * Tests whether bulk Prisma operations work on the current Neon adapter.
 * TEMPORARY — remove after testing.
 */
export async function GET() {
  const results: Record<string, { success: boolean; detail: string }> = {};
  const testHouseholdId = 'neon-compat-test';

  try {
    // Clean up any previous test data
    const existing = await prisma.shoppingCategory.findMany({
      where: { householdId: testHouseholdId },
    });
    for (const cat of existing) {
      await prisma.shoppingCategory.delete({ where: { id: cat.id } });
    }

    // --- Test 1: createMany ---
    try {
      const createResult = await prisma.shoppingCategory.createMany({
        data: [
          { name: 'Test-A', sortOrder: 0, householdId: testHouseholdId },
          { name: 'Test-B', sortOrder: 1, householdId: testHouseholdId },
          { name: 'Test-C', sortOrder: 2, householdId: testHouseholdId },
        ],
      });

      const created = await prisma.shoppingCategory.findMany({
        where: { householdId: testHouseholdId },
      });

      results['createMany'] = {
        success: created.length === 3,
        detail: `createMany returned count=${createResult.count}, actual rows=${created.length}`,
      };
    } catch (e) {
      results['createMany'] = {
        success: false,
        detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // --- Test 2: updateMany ---
    try {
      const updateResult = await prisma.shoppingCategory.updateMany({
        where: { householdId: testHouseholdId },
        data: { sortOrder: 99 },
      });

      const updated = await prisma.shoppingCategory.findMany({
        where: { householdId: testHouseholdId, sortOrder: 99 },
      });

      results['updateMany'] = {
        success: updated.length === 3,
        detail: `updateMany returned count=${updateResult.count}, rows with sortOrder=99: ${updated.length}`,
      };
    } catch (e) {
      results['updateMany'] = {
        success: false,
        detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // --- Test 3: deleteMany ---
    try {
      const deleteResult = await prisma.shoppingCategory.deleteMany({
        where: { householdId: testHouseholdId },
      });

      const remaining = await prisma.shoppingCategory.findMany({
        where: { householdId: testHouseholdId },
      });

      results['deleteMany'] = {
        success: remaining.length === 0,
        detail: `deleteMany returned count=${deleteResult.count}, remaining rows=${remaining.length}`,
      };
    } catch (e) {
      results['deleteMany'] = {
        success: false,
        detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // --- Test 4: interactive $transaction ---
    try {
      // First create some test data
      await prisma.shoppingCategory.create({
        data: { name: 'TxTest-A', sortOrder: 0, householdId: testHouseholdId },
      });
      await prisma.shoppingCategory.create({
        data: { name: 'TxTest-B', sortOrder: 1, householdId: testHouseholdId },
      });

      const txResult = await prisma.$transaction(async (tx) => {
        const items = await tx.shoppingCategory.findMany({
          where: { householdId: testHouseholdId },
        });
        for (const item of items) {
          await tx.shoppingCategory.update({
            where: { id: item.id },
            data: { sortOrder: 50 },
          });
        }
        return items.length;
      });

      const afterTx = await prisma.shoppingCategory.findMany({
        where: { householdId: testHouseholdId, sortOrder: 50 },
      });

      results['$transaction_interactive'] = {
        success: afterTx.length === 2,
        detail: `$transaction returned ${txResult}, rows with sortOrder=50: ${afterTx.length}`,
      };
    } catch (e) {
      results['$transaction_interactive'] = {
        success: false,
        detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // --- Test 5: createMany with skipDuplicates ---
    try {
      const skipResult = await prisma.shoppingCategory.createMany({
        data: [
          { name: 'TxTest-A', sortOrder: 0, householdId: testHouseholdId },
          { name: 'TxTest-New', sortOrder: 3, householdId: testHouseholdId },
        ],
        skipDuplicates: true,
      });

      const afterSkip = await prisma.shoppingCategory.findMany({
        where: { householdId: testHouseholdId },
      });

      const hasNew = afterSkip.some((c) => c.name === 'TxTest-New');

      results['createMany_skipDuplicates'] = {
        success: hasNew,
        detail: `createMany(skipDuplicates) returned count=${skipResult.count}, total rows=${afterSkip.length}, new row created=${hasNew}`,
      };
    } catch (e) {
      results['createMany_skipDuplicates'] = {
        success: false,
        detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // --- Cleanup ---
    const cleanup = await prisma.shoppingCategory.findMany({
      where: { householdId: testHouseholdId },
    });
    for (const cat of cleanup) {
      await prisma.shoppingCategory.delete({ where: { id: cat.id } });
    }

    const allPassed = Object.values(results).every((r) => r.success);

    return NextResponse.json({
      success: true,
      allPassed,
      results,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      results,
    });
  }
}
