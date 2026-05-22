-- Add clusterScope to AdminUser
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "clusterScope" BOOLEAN NOT NULL DEFAULT false;

-- Cluster
CREATE TABLE IF NOT EXISTS "Cluster" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "name"           TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'active',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ClusterHotel
CREATE TABLE IF NOT EXISTS "ClusterHotel" (
  "id"         SERIAL PRIMARY KEY,
  "clusterId"  INTEGER NOT NULL REFERENCES "Cluster"("id") ON DELETE CASCADE,
  "propertyId" INTEGER NOT NULL,
  CONSTRAINT "ClusterHotel_clusterId_propertyId_key" UNIQUE ("clusterId", "propertyId")
);

-- ClusterUser
CREATE TABLE IF NOT EXISTS "ClusterUser" (
  "id"          SERIAL PRIMARY KEY,
  "clusterId"   INTEGER NOT NULL REFERENCES "Cluster"("id") ON DELETE CASCADE,
  "adminUserId" INTEGER NOT NULL,
  "role"        TEXT NOT NULL,
  CONSTRAINT "ClusterUser_clusterId_adminUserId_key" UNIQUE ("clusterId", "adminUserId")
);
