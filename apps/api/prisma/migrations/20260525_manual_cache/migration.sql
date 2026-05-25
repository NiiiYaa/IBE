CREATE TABLE "ManualCache" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "sectionsJson" JSONB NOT NULL,
    CONSTRAINT "ManualCache_pkey" PRIMARY KEY ("id")
);
