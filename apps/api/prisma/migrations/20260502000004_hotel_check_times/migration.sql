-- Add check-in and check-out time fields to HotelConfig
ALTER TABLE "HotelConfig" ADD COLUMN IF NOT EXISTS "checkInTime" TEXT;
ALTER TABLE "HotelConfig" ADD COLUMN IF NOT EXISTS "checkOutTime" TEXT;
