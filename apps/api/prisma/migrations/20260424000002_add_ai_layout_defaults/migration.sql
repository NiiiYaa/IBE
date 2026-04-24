ALTER TABLE "HotelConfig" ADD COLUMN "aiLayoutDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HotelConfig" ADD COLUMN "searchAiLayoutDefault" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OrgDesignDefaults" ADD COLUMN "aiLayoutDefault" BOOLEAN;
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "searchAiLayoutDefault" BOOLEAN;
