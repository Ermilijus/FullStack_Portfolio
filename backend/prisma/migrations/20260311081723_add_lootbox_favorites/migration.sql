-- CreateTable
CREATE TABLE "LootboxFavorite" (
    "userId" TEXT NOT NULL,
    "lootboxId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "lootboxId"),
    CONSTRAINT "LootboxFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LootboxFavorite_lootboxId_fkey" FOREIGN KEY ("lootboxId") REFERENCES "Lootbox" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
