ALTER TABLE "GroupConfig"
  ADD COLUMN IF NOT EXISTS "rateSelection" TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS "ratePriority"  JSONB NOT NULL DEFAULT '[{"board":"RO","isRefundable":true},{"board":"RO","isRefundable":false},{"board":"BB","isRefundable":true},{"board":"BB","isRefundable":false},{"board":"HB","isRefundable":true},{"board":"HB","isRefundable":false},{"board":"FB","isRefundable":true},{"board":"FB","isRefundable":false},{"board":"AI","isRefundable":true},{"board":"AI","isRefundable":false}]';

ALTER TABLE "PropertyGroupConfig"
  ADD COLUMN IF NOT EXISTS "rateSelection" TEXT,
  ADD COLUMN IF NOT EXISTS "ratePriority"  JSONB;
