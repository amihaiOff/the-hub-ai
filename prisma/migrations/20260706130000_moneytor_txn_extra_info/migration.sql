-- Store Moneytor's `extra_info` field — freeform payee/context metadata
-- present on ~23% of transactions (customer notes, Bit P2P sender/receiver
-- context, insurance claim references, etc.). Populated on next sync;
-- older rows outside the sync window stay NULL until a force-resync.

ALTER TABLE "moneytor_transactions" ADD COLUMN "extra_info" TEXT;
