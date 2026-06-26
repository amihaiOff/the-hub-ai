import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/moneytor/real-estate
 * Returns the active household's Moneytor real-estate properties, plus a
 * total `balanceInBase` so the dashboard / assets page can show a summary
 * without recomputing.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const rows = await prisma.moneytorRealEstate.findMany({
      where: { householdId },
      orderBy: [{ balanceInBase: 'desc' }],
    });

    const properties = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      name: r.name,
      currentValue: Number(r.currentValue),
      balanceInBase: Number(r.balanceInBase),
      currency: r.currency,
      ownership: r.ownership != null ? Number(r.ownership) : null,
      purchasePrice: r.purchasePrice != null ? Number(r.purchasePrice) : null,
      purchaseDate: r.purchaseDate ? r.purchaseDate.toISOString().split('T')[0] : null,
      purchaseExpenses: r.purchaseExpenses != null ? Number(r.purchaseExpenses) : null,
      country: r.country,
      city: r.city,
      street: r.street,
      houseNumber: r.houseNumber,
      address: r.address,
      latitude: r.latitude != null ? Number(r.latitude) : null,
      longitude: r.longitude != null ? Number(r.longitude) : null,
      propertyType: r.propertyType,
      propertyCondition: r.propertyCondition,
      measurementUnit: r.measurementUnit,
      builtArea: r.builtArea != null ? Number(r.builtArea) : null,
      gardenBalconySize: r.gardenBalconySize != null ? Number(r.gardenBalconySize) : null,
      bedrooms: r.bedrooms,
      floor: r.floor,
      apartmentFloors: r.apartmentFloors,
      rent: r.rent != null ? Number(r.rent) : null,
      rentSuggestion: r.rentSuggestion != null ? Number(r.rentSuggestion) : null,
      rentType: r.rentType,
      incomeFrequency: r.incomeFrequency,
      saleCommission: r.saleCommission != null ? Number(r.saleCommission) : null,
      profitTax: r.profitTax != null ? Number(r.profitTax) : null,
      generalSellingExpenses:
        r.generalSellingExpenses != null ? Number(r.generalSellingExpenses) : null,
      legalExpenses: r.legalExpenses != null ? Number(r.legalExpenses) : null,
      linkedMortgageRef: r.linkedMortgageRef,
      customSubtitle: r.customSubtitle,
      syncedAt: r.syncedAt.toISOString(),
    }));

    const total = properties.reduce((s, p) => s + p.balanceInBase, 0);

    const asOf =
      rows.length > 0
        ? rows.reduce((latest, r) => (r.syncedAt > latest ? r.syncedAt : latest), rows[0].syncedAt)
        : null;

    return NextResponse.json({
      ok: true,
      asOf: asOf ? asOf.toISOString() : null,
      properties,
      totals: { realEstate: total },
    });
  } catch (err) {
    console.error('Moneytor real-estate list failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load real estate. Check server logs.' },
      { status: 500 }
    );
  }
}
