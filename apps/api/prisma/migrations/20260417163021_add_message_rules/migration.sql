-- CreateTable
CREATE TABLE "MessageRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channels" TEXT NOT NULL DEFAULT '[]',
    "trigger" TEXT NOT NULL,
    "offsetValue" INTEGER NOT NULL DEFAULT 0,
    "offsetUnit" TEXT NOT NULL DEFAULT 'hours',
    "direction" TEXT NOT NULL DEFAULT 'after',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
