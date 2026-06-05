-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Package" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "routerId" TEXT,
    "name" TEXT NOT NULL,
    "speedUp" TEXT,
    "speedDown" TEXT,
    "price" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Package_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Package_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "Router" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Package" ("createdAt", "description", "id", "name", "price", "speedDown", "speedUp", "tenantId", "updatedAt") SELECT "createdAt", "description", "id", "name", "price", "speedDown", "speedUp", "tenantId", "updatedAt" FROM "Package";
DROP TABLE "Package";
ALTER TABLE "new_Package" RENAME TO "Package";
CREATE INDEX "Package_tenantId_idx" ON "Package"("tenantId");
CREATE INDEX "Package_routerId_idx" ON "Package"("routerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
