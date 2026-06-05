-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "waNumber" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Router" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 8728,
    "user" TEXT NOT NULL DEFAULT 'admin',
    "password" TEXT NOT NULL,
    "wanInterface" TEXT,
    "timeout" INTEGER NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Router_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Router" ("createdAt", "host", "id", "isActive", "name", "password", "port", "tenantId", "timeout", "updatedAt", "user", "wanInterface") SELECT "createdAt", "host", "id", "isActive", "name", "password", "port", "tenantId", "timeout", "updatedAt", "user", "wanInterface" FROM "Router";
DROP TABLE "Router";
ALTER TABLE "new_Router" RENAME TO "Router";
CREATE INDEX "Router_tenantId_idx" ON "Router"("tenantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
