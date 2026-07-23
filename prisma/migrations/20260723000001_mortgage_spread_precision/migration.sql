-- Widen rate_spread from Decimal(5,4) to Decimal(7,5) so 0.00975 (0.975%)
-- and similar sub-basis-point spreads store exactly. Reflected in Prisma
-- schema.
ALTER TABLE "mortgage_tracks"
  ALTER COLUMN "rate_spread" TYPE DECIMAL(7, 5);
