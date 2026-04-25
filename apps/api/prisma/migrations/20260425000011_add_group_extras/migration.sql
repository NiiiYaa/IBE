ALTER TABLE "GroupConfig"
  ADD COLUMN "mealsConfig" JSONB NOT NULL DEFAULT '{"breakfast":{"enabled":false,"priceAdult":0,"priceChild":0,"priceInfant":0},"lunch":{"enabled":false,"priceAdult":0,"priceChild":0,"priceInfant":0},"dinner":{"enabled":false,"priceAdult":0,"priceChild":0,"priceInfant":0}}',
  ADD COLUMN "meetingRoomConfig" JSONB NOT NULL DEFAULT '{"enabled":false,"pricePerDay":0}',
  ADD COLUMN "freeRoomsConfig" JSONB NOT NULL DEFAULT '{"enabled":false,"count":0}';

ALTER TABLE "PropertyGroupConfig"
  ADD COLUMN "mealsConfig" JSONB,
  ADD COLUMN "meetingRoomConfig" JSONB,
  ADD COLUMN "freeRoomsConfig" JSONB;
