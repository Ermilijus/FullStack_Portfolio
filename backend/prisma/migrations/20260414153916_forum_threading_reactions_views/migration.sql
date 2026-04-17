-- AlterTable
ALTER TABLE "LootboxRoll" ADD COLUMN "dropTrace" TEXT;
ALTER TABLE "LootboxRoll" ADD COLUMN "requestId" TEXT;
ALTER TABLE "LootboxRoll" ADD COLUMN "rollValue" REAL;
ALTER TABLE "LootboxRoll" ADD COLUMN "serverSeed" TEXT;
ALTER TABLE "LootboxRoll" ADD COLUMN "totalWeight" INTEGER;

-- CreateTable
CREATE TABLE "EconomyLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "currencyType" TEXT NOT NULL,
    "amountDelta" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EconomyLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ForumPostReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ForumPostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForumPostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ForumPostView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ForumPostView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForumPostView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ForumReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentReplyId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ForumReply_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForumReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForumReply_parentReplyId_fkey" FOREIGN KEY ("parentReplyId") REFERENCES "ForumReply" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ForumReply" ("content", "createdAt", "id", "postId", "updatedAt", "userId") SELECT "content", "createdAt", "id", "postId", "updatedAt", "userId" FROM "ForumReply";
DROP TABLE "ForumReply";
ALTER TABLE "new_ForumReply" RENAME TO "ForumReply";
CREATE INDEX "ForumReply_postId_createdAt_idx" ON "ForumReply"("postId", "createdAt");
CREATE INDEX "ForumReply_userId_createdAt_idx" ON "ForumReply"("userId", "createdAt");
CREATE INDEX "ForumReply_parentReplyId_idx" ON "ForumReply"("parentReplyId");
CREATE TABLE "new_Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "description" TEXT,
    "rarity" TEXT NOT NULL,
    "realWorldValue" DECIMAL NOT NULL,
    "isCs2" BOOLEAN NOT NULL DEFAULT false,
    "sourceItemKey" TEXT,
    "sourceDefIndex" INTEGER,
    "sourcePaintIndex" INTEGER,
    "sourceQuality" TEXT,
    "sourcePhase" TEXT,
    "sourceRarityId" INTEGER,
    "weaponType" TEXT,
    "wearMin" REAL,
    "wearMax" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Item" ("createdAt", "description", "id", "image", "name", "rarity", "realWorldValue", "updatedAt", "weaponType", "wearMax", "wearMin") SELECT "createdAt", "description", "id", "image", "name", "rarity", "realWorldValue", "updatedAt", "weaponType", "wearMax", "wearMin" FROM "Item";
DROP TABLE "Item";
ALTER TABLE "new_Item" RENAME TO "Item";
CREATE UNIQUE INDEX "Item_sourceItemKey_key" ON "Item"("sourceItemKey");
CREATE INDEX "Item_isCs2_rarity_idx" ON "Item"("isCs2", "rarity");
CREATE INDEX "Item_weaponType_rarity_idx" ON "Item"("weaponType", "rarity");
CREATE INDEX "Item_sourceDefIndex_sourcePaintIndex_idx" ON "Item"("sourceDefIndex", "sourcePaintIndex");
CREATE TABLE "new_Lootbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "description" TEXT,
    "cost" INTEGER NOT NULL,
    "spendCurrency" TEXT NOT NULL DEFAULT 'currency',
    "isCs2" BOOLEAN NOT NULL DEFAULT false,
    "sourceContainerKey" TEXT,
    "sourceAssociatedDef" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Lootbox" ("cost", "createdAt", "description", "id", "image", "isActive", "name", "updatedAt") SELECT "cost", "createdAt", "description", "id", "image", "isActive", "name", "updatedAt" FROM "Lootbox";
DROP TABLE "Lootbox";
ALTER TABLE "new_Lootbox" RENAME TO "Lootbox";
CREATE UNIQUE INDEX "Lootbox_sourceContainerKey_key" ON "Lootbox"("sourceContainerKey");
CREATE TABLE "new_UserItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "reservedForTrade" INTEGER NOT NULL DEFAULT 0,
    "reservedForMarket" INTEGER NOT NULL DEFAULT 0,
    "wearSeed" TEXT,
    "patternSeed" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserItem" ("createdAt", "id", "itemId", "patternSeed", "quantity", "updatedAt", "userId", "wearSeed") SELECT "createdAt", "id", "itemId", "patternSeed", "quantity", "updatedAt", "userId", "wearSeed" FROM "UserItem";
DROP TABLE "UserItem";
ALTER TABLE "new_UserItem" RENAME TO "UserItem";
CREATE UNIQUE INDEX "UserItem_userId_itemId_key" ON "UserItem"("userId", "itemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EconomyLog_userId_createdAt_idx" ON "EconomyLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumPostReaction_postId_type_idx" ON "ForumPostReaction"("postId", "type");

-- CreateIndex
CREATE INDEX "ForumPostReaction_userId_createdAt_idx" ON "ForumPostReaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ForumPostReaction_postId_userId_key" ON "ForumPostReaction"("postId", "userId");

-- CreateIndex
CREATE INDEX "ForumPostView_postId_createdAt_idx" ON "ForumPostView"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumPostView_userId_createdAt_idx" ON "ForumPostView"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ForumPostView_postId_userId_key" ON "ForumPostView"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumCategory_name_key" ON "ForumCategory"("name");

-- CreateIndex
CREATE INDEX "ForumPost_userId_createdAt_idx" ON "ForumPost"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumPost_categoryId_createdAt_idx" ON "ForumPost"("categoryId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumPost_createdAt_idx" ON "ForumPost"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LootboxRoll_requestId_key" ON "LootboxRoll"("requestId");

