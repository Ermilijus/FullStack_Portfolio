import { FastifyPluginAsync } from "fastify";

const OPEN_RATE_WINDOW_MS = 60_000;
const OPEN_RATE_MAX_REQUESTS = 8;

type LootboxOddsEntry = {
  itemId: string;
  quantity: number;
  weight: number;
  item: {
    rarity: string;
    weaponType?: string | null;
  };
};

type OddsBucket = "mil-spec" | "restricted" | "classified" | "covert" | "gold";

type BucketChanceRow = {
  bucket: OddsBucket;
  baseChance: number;
  normalizedChance: number;
  poolSize: number;
};

type Cs2OddsProfile<T extends LootboxOddsEntry> = {
  poolByBucket: Record<OddsBucket, T[]>;
  availableBuckets: BucketChanceRow[];
  totalBaseChance: number;
  perItemChanceByItemId: Map<string, number>;
};

const CS2_CASE_BUCKET_ODDS: Array<{ bucket: OddsBucket; chance: number }> = [
  { bucket: "mil-spec", chance: 79.92 },
  { bucket: "restricted", chance: 15.98 },
  { bucket: "classified", chance: 3.2 },
  { bucket: "covert", chance: 0.64 },
  { bucket: "gold", chance: 0.26 },
];

const normalizeRarity = (rarity: string) => rarity.trim().toLowerCase();

const bucketForEntry = (entry: LootboxOddsEntry): OddsBucket => {
  const rarity = normalizeRarity(entry.item.rarity);

  if (entry.item.weaponType === "Knife" || entry.item.weaponType === "Gloves" || rarity === "contraband") {
    return "gold";
  }
  if (rarity === "restricted") {
    return "restricted";
  }
  if (rarity === "classified") {
    return "classified";
  }
  if (rarity === "covert") {
    return "covert";
  }

  // Consumer/Industrial legacy items are treated as Mil-Spec bucket for case-open odds.
  return "mil-spec";
};

const buildCs2OddsProfile = <T extends LootboxOddsEntry>(entries: T[]): Cs2OddsProfile<T> => {
  const poolByBucket: Record<OddsBucket, T[]> = {
    "mil-spec": [],
    restricted: [],
    classified: [],
    covert: [],
    gold: [],
  };

  for (const entry of entries) {
    poolByBucket[bucketForEntry(entry)].push(entry);
  }

  const availableBucketsBase = CS2_CASE_BUCKET_ODDS.filter(({ bucket }) => poolByBucket[bucket].length > 0);
  const totalBaseChance = availableBucketsBase.reduce((sum, row) => sum + row.chance, 0);
  const availableBuckets: BucketChanceRow[] = availableBucketsBase.map((row) => ({
    bucket: row.bucket,
    baseChance: row.chance,
    normalizedChance: totalBaseChance > 0 ? (row.chance / totalBaseChance) * 100 : 0,
    poolSize: poolByBucket[row.bucket].length,
  }));

  const perItemChanceByItemId = new Map<string, number>();
  for (const row of availableBuckets) {
    const perItemChance = row.poolSize > 0 ? row.normalizedChance / row.poolSize : 0;
    for (const entry of poolByBucket[row.bucket]) {
      perItemChanceByItemId.set(entry.itemId, perItemChance);
    }
  }

  return {
    poolByBucket,
    availableBuckets,
    totalBaseChance,
    perItemChanceByItemId,
  };
};

const pickFromCs2OddsProfile = <T extends LootboxOddsEntry>(profile: Cs2OddsProfile<T>) => {
  if (profile.availableBuckets.length === 0 || profile.totalBaseChance <= 0) {
    return null;
  }

  const bucketRollValue = Math.random() * profile.totalBaseChance;
  let cursor = bucketRollValue;
  let selectedBucket = profile.availableBuckets[profile.availableBuckets.length - 1].bucket;

  for (const row of profile.availableBuckets) {
    cursor -= row.baseChance;
    if (cursor <= 0) {
      selectedBucket = row.bucket;
      break;
    }
  }

  const selectedBucketPool = profile.poolByBucket[selectedBucket];
  const itemRollIndex = Math.floor(Math.random() * selectedBucketPool.length);
  const selectedEntry = selectedBucketPool[itemRollIndex];

  return {
    selectedEntry,
    trace: {
      selectedBucket,
      bucketRollValue,
      totalChance: profile.totalBaseChance,
      itemRollIndex,
      bucketPoolSize: selectedBucketPool.length,
      availableBuckets: profile.availableBuckets.map((row) => ({
        bucket: row.bucket,
        chance: row.baseChance,
        normalizedChance: row.normalizedChance,
        poolSize: row.poolSize,
      })),
    },
  };
};

const pickEntryByCs2Odds = <T extends LootboxOddsEntry>(entries: T[]) => {
  const profile = buildCs2OddsProfile(entries);
  return pickFromCs2OddsProfile(profile);
};

const pickCs2Meta = (item: {
  isCs2: boolean;
  sourceDefIndex: number | null;
  sourcePaintIndex: number | null;
  sourceQuality: string | null;
  sourcePhase: string | null;
}) => ({
  isCs2: item.isCs2,
  sourceDefIndex: item.sourceDefIndex,
  sourcePaintIndex: item.sourcePaintIndex,
  sourceQuality: item.sourceQuality,
  sourcePhase: item.sourcePhase,
});

export const lootboxRoutes: FastifyPluginAsync = async (app) => {
  app.get("/catalog", { onRequest: [app.authenticate] }, async (request) => {
    const [lootboxes, favorites] = await Promise.all([
      app.prisma.lootbox.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            orderBy: [{ weight: "desc" }, { createdAt: "asc" }],
            take: 5,
            include: {
              item: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  rarity: true,
                  realWorldValue: true,
                  isCs2: true,
                  sourceDefIndex: true,
                  sourcePaintIndex: true,
                  sourceQuality: true,
                  sourcePhase: true,
                  weaponType: true,
                },
              },
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      app.prisma.lootboxFavorite.findMany({
        where: { userId: request.user.id },
        select: { lootboxId: true },
      }),
    ]);

    const favoriteSet = new Set(favorites.map((favorite) => favorite.lootboxId));

    return {
      lootboxes: lootboxes.map((lootbox) => {
        const previewItems = lootbox.items.map((entry) => ({
          id: entry.item.id,
          name: entry.item.name,
          image: entry.item.image,
          rarity: entry.item.rarity,
          marketPrice: Number(entry.item.realWorldValue),
          weight: entry.weight,
          quantity: entry.quantity,
          cs2: pickCs2Meta(entry.item),
        }));

        return {
          id: lootbox.id,
          name: lootbox.name,
          image: lootbox.image,
          description: lootbox.description,
          cost: lootbox.cost,
          spendCurrency: lootbox.spendCurrency,
          isFavorited: favoriteSet.has(lootbox.id),
          previewItems,
          totalDropPoolItems: lootbox._count.items,
        };
      }),
    };
  });

  app.get("/favorites", { onRequest: [app.authenticate] }, async (request) => {
    const favorites = await app.prisma.lootboxFavorite.findMany({
      where: { userId: request.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        lootbox: {
          select: {
            id: true,
            name: true,
            image: true,
            description: true,
            cost: true,
            isActive: true,
          },
        },
      },
    });

    return {
      lootboxes: favorites
        .filter((favorite) => favorite.lootbox.isActive)
        .map((favorite) => ({
          id: favorite.lootbox.id,
          name: favorite.lootbox.name,
          image: favorite.lootbox.image,
          description: favorite.lootbox.description,
          cost: favorite.lootbox.cost,
          isFavorited: true,
          favoritedAt: favorite.createdAt,
        })),
    };
  });

  app.get<{ Params: { id: string } }>("/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params;
    if (!id?.trim()) {
      return reply.status(400).send({ error: "Lootbox id is required" });
    }

    const [lootbox, favorite] = await Promise.all([
      app.prisma.lootbox.findFirst({
        where: { id, isActive: true },
        include: {
          items: {
            orderBy: [{ weight: "desc" }, { createdAt: "asc" }],
            include: {
              item: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  description: true,
                  rarity: true,
                  realWorldValue: true,
                  isCs2: true,
                  sourceDefIndex: true,
                  sourcePaintIndex: true,
                  sourceQuality: true,
                  sourcePhase: true,
                  weaponType: true,
                },
              },
            },
          },
        },
      }),
      app.prisma.lootboxFavorite.findUnique({
        where: {
          userId_lootboxId: {
            userId: request.user.id,
            lootboxId: id,
          },
        },
        select: { lootboxId: true },
      }),
    ]);

    if (!lootbox) {
      return reply.status(404).send({ error: "Lootbox not found" });
    }

    const [totalOpens, userOpens, recentRolls] = await Promise.all([
      app.prisma.lootboxRoll.count({ where: { lootboxId: id } }),
      app.prisma.lootboxRoll.count({ where: { lootboxId: id, userId: request.user.id } }),
      app.prisma.lootboxRoll.findMany({
        where: { lootboxId: id },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: {
          user: {
            select: {
              username: true,
            },
          },
        },
      }),
    ]);

    const recentItemIds = [...new Set(recentRolls.map((roll) => roll.resultItemId))];
    const recentItems = await app.prisma.item.findMany({
      where: { id: { in: recentItemIds } },
      select: {
        id: true,
        name: true,
        image: true,
        rarity: true,
        isCs2: true,
        sourceDefIndex: true,
        sourcePaintIndex: true,
        sourceQuality: true,
        sourcePhase: true,
      },
    });
    const recentItemMap = new Map(recentItems.map((item) => [item.id, item]));
    const oddsProfile = buildCs2OddsProfile(lootbox.items);

    return {
      lootbox: {
        id: lootbox.id,
        name: lootbox.name,
        image: lootbox.image,
        description: lootbox.description,
        cost: lootbox.cost,
        spendCurrency: lootbox.spendCurrency,
        isFavorited: Boolean(favorite),
        items: lootbox.items.map((entry) => ({
          id: entry.item.id,
          name: entry.item.name,
          image: entry.item.image,
          description: entry.item.description,
          rarity: entry.item.rarity,
          marketPrice: Number(entry.item.realWorldValue),
          weight: entry.weight,
          dropRatePercent: Number((oddsProfile.perItemChanceByItemId.get(entry.itemId) ?? 0).toFixed(6)),
          quantity: entry.quantity,
          cs2: pickCs2Meta(entry.item),
        })),
        oddsModel: {
          mode: "cs2-official-bucket-odds",
          buckets: oddsProfile.availableBuckets.map((row) => ({
            bucket: row.bucket,
            baseChance: Number(row.baseChance.toFixed(4)),
            normalizedChance: Number(row.normalizedChance.toFixed(6)),
            poolSize: row.poolSize,
          })),
        },
        stats: {
          totalOpens,
          userOpens,
        },
        recentDrops: recentRolls
          .map((roll) => {
            const item = recentItemMap.get(roll.resultItemId);
            if (!item) {
              return null;
            }

            return {
              rollId: roll.id,
              droppedBy: roll.user.username,
              createdAt: roll.createdAt,
              item: {
                id: item.id,
                name: item.name,
                image: item.image,
                rarity: item.rarity,
                cs2: pickCs2Meta(item),
              },
            };
          })
          .filter((drop): drop is NonNullable<typeof drop> => Boolean(drop)),
      },
    };
  });

  app.get<{ Params: { id: string }; Querystring: { samples?: string } }>(
    "/:id/simulate-odds",
    { onRequest: [app.authenticate, app.authorizeAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      if (!id?.trim()) {
        return reply.status(400).send({ error: "Lootbox id is required" });
      }

      const rawSamples = Number.parseInt(request.query.samples ?? "100000", 10);
      const samples = Number.isFinite(rawSamples)
        ? Math.max(1000, Math.min(rawSamples, 1_000_000))
        : 100000;

      const lootbox = await app.prisma.lootbox.findFirst({
        where: { id, isActive: true },
        include: {
          items: {
            include: {
              item: {
                select: {
                  id: true,
                  name: true,
                  rarity: true,
                  weaponType: true,
                },
              },
            },
          },
        },
      });

      if (!lootbox || lootbox.items.length === 0) {
        return reply.status(404).send({ error: "Lootbox not found or unavailable" });
      }

      const profile = buildCs2OddsProfile(lootbox.items);
      if (profile.availableBuckets.length === 0) {
        return reply.status(422).send({ error: "This lootbox has no eligible items for CS2 odds selection." });
      }

      const bucketHits = new Map<OddsBucket, number>();
      const rarityHits = new Map<string, number>();
      const itemHits = new Map<string, number>();

      for (let index = 0; index < samples; index += 1) {
        const pick = pickFromCs2OddsProfile(profile);
        if (!pick) {
          return reply.status(422).send({ error: "This lootbox has no eligible items for CS2 odds selection." });
        }

        const bucketKey = pick.trace.selectedBucket;
        bucketHits.set(bucketKey, (bucketHits.get(bucketKey) ?? 0) + 1);

        const rarityKey = pick.selectedEntry.item.rarity;
        rarityHits.set(rarityKey, (rarityHits.get(rarityKey) ?? 0) + 1);

        const itemKey = pick.selectedEntry.itemId;
        itemHits.set(itemKey, (itemHits.get(itemKey) ?? 0) + 1);
      }

      const itemMetaById = new Map(
        lootbox.items.map((entry) => [entry.itemId, {
          name: entry.item.name,
          rarity: entry.item.rarity,
        }]),
      );

      return {
        simulation: {
          lootboxId: lootbox.id,
          lootboxName: lootbox.name,
          mode: "cs2-official-bucket-odds",
          samples,
          expectedBuckets: profile.availableBuckets.map((row) => ({
            bucket: row.bucket,
            baseChance: Number(row.baseChance.toFixed(4)),
            normalizedChance: Number(row.normalizedChance.toFixed(6)),
            poolSize: row.poolSize,
          })),
          observedBuckets: profile.availableBuckets.map((row) => {
            const hits = bucketHits.get(row.bucket) ?? 0;
            return {
              bucket: row.bucket,
              hits,
              observedChance: Number(((hits / samples) * 100).toFixed(6)),
            };
          }),
          observedRarities: [...rarityHits.entries()]
            .map(([rarity, hits]) => ({
              rarity,
              hits,
              observedChance: Number(((hits / samples) * 100).toFixed(6)),
            }))
            .sort((a, b) => b.hits - a.hits),
          observedItemsTop20: [...itemHits.entries()]
            .map(([itemId, hits]) => {
              const meta = itemMetaById.get(itemId);
              return {
                itemId,
                name: meta?.name ?? itemId,
                rarity: meta?.rarity ?? "Unknown",
                hits,
                observedChance: Number(((hits / samples) * 100).toFixed(6)),
                expectedChance: Number((profile.perItemChanceByItemId.get(itemId) ?? 0).toFixed(6)),
              };
            })
            .sort((a, b) => b.hits - a.hits)
            .slice(0, 20),
        },
      };
    },
  );

  app.get("/history", { onRequest: [app.authenticate] }, async (request) => {
    const rolls = await app.prisma.lootboxRoll.findMany({
      where: { userId: request.user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        lootbox: {
          select: {
            id: true,
            name: true,
            image: true,
            spendCurrency: true,
          },
        },
      },
    });

    const itemIds = [...new Set(rolls.map((roll) => roll.resultItemId))];
    const items = await app.prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true,
        name: true,
        image: true,
        rarity: true,
        realWorldValue: true,
        isCs2: true,
        sourceDefIndex: true,
        sourcePaintIndex: true,
        sourceQuality: true,
        sourcePhase: true,
      },
    });
    const itemMap = new Map(items.map((item) => [item.id, item]));

    return {
      rolls: rolls
        .map((roll) => {
          const item = itemMap.get(roll.resultItemId);
          if (!item) {
            return null;
          }

          return {
            id: roll.id,
            requestId: roll.requestId,
            costPaid: roll.costPaid,
            createdAt: roll.createdAt,
            lootbox: roll.lootbox,
            item: {
              id: item.id,
              name: item.name,
              image: item.image,
              rarity: item.rarity,
              marketPrice: Number(item.realWorldValue),
              cs2: pickCs2Meta(item),
            },
          };
        })
        .filter((roll): roll is NonNullable<typeof roll> => Boolean(roll)),
    };
  });

  app.post<{ Params: { id: string }; Body: { requestId?: string } }>(
    "/:id/open",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      if (!id?.trim()) {
        return reply.status(400).send({ error: "Lootbox id is required" });
      }

      const requestId = request.body?.requestId?.trim() || undefined;
      const rateWindowStart = new Date(Date.now() - OPEN_RATE_WINDOW_MS);
      const recentOpenCount = await app.prisma.lootboxRoll.count({
        where: {
          userId: request.user.id,
          createdAt: { gte: rateWindowStart },
        },
      });

      if (recentOpenCount >= OPEN_RATE_MAX_REQUESTS) {
        const user = await app.prisma.user.findUnique({
          where: { id: request.user.id },
          select: { currency: true },
        });

        if (user) {
          await app.prisma.economyLog.create({
            data: {
              userId: request.user.id,
              eventType: "LOOTBOX_OPEN_BLOCKED",
              currencyType: "currency",
              amountDelta: 0,
              balanceBefore: user.currency,
              balanceAfter: user.currency,
              reason: "RATE_LIMIT",
              metadata: JSON.stringify({ lootboxId: id, requestId }),
            },
          });
        }

        return reply.status(429).send({ error: "Too many open attempts. Please wait a moment." });
      }

      const lootbox = await app.prisma.lootbox.findFirst({
        where: { id, isActive: true },
        include: {
          items: {
            include: {
              item: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  description: true,
                  rarity: true,
                  realWorldValue: true,
                  isCs2: true,
                  sourceDefIndex: true,
                  sourcePaintIndex: true,
                  sourceQuality: true,
                  sourcePhase: true,
                  weaponType: true,
                },
              },
            },
          },
        },
      });

      if (!lootbox || lootbox.items.length === 0) {
        return reply.status(404).send({ error: "Lootbox not found or unavailable" });
      }

      if (requestId) {
        const existingRoll = await app.prisma.lootboxRoll.findUnique({
          where: { requestId },
        });

        if (existingRoll) {
          if (existingRoll.userId !== request.user.id) {
            return reply.status(409).send({ error: "requestId already used" });
          }

          const [item, inventory] = await Promise.all([
            app.prisma.item.findUnique({
              where: { id: existingRoll.resultItemId },
              select: {
                id: true,
                name: true,
                image: true,
                description: true,
                rarity: true,
                realWorldValue: true,
                isCs2: true,
                sourceDefIndex: true,
                sourcePaintIndex: true,
                sourceQuality: true,
                sourcePhase: true,
                weaponType: true,
              },
            }),
            app.prisma.userItem.findUnique({
              where: {
                userId_itemId: {
                  userId: request.user.id,
                  itemId: existingRoll.resultItemId,
                },
              },
              select: {
                quantity: true,
                reservedForTrade: true,
                reservedForMarket: true,
              },
            }),
          ]);

          if (!item) {
            return reply.status(404).send({ error: "Item for this roll no longer exists" });
          }

          return {
            result: {
              idempotentReplay: true,
              rollId: existingRoll.id,
              requestId: existingRoll.requestId,
              lootbox: {
                id: lootbox.id,
                name: lootbox.name,
                image: lootbox.image,
              },
              spent: {
                wallet: lootbox.spendCurrency,
                amount: existingRoll.costPaid,
              },
              item: {
                id: item.id,
                name: item.name,
                image: item.image,
                description: item.description,
                rarity: item.rarity,
                marketPrice: Number(item.realWorldValue),
                cs2: pickCs2Meta(item),
              },
              inventory: {
                quantity: inventory?.quantity ?? 0,
                reservedForTrade: inventory?.reservedForTrade ?? 0,
                reservedForMarket: inventory?.reservedForMarket ?? 0,
              },
              trace: {
                rollValue: existingRoll.rollValue,
                totalWeight: existingRoll.totalWeight,
              },
              createdAt: existingRoll.createdAt,
              pool: lootbox.items.map((entry) => ({
                id: entry.item.id,
                name: entry.item.name,
                image: entry.item.image,
                rarity: entry.item.rarity,
                weight: entry.weight,
                marketPrice: Number(entry.item.realWorldValue),
                cs2: pickCs2Meta(entry.item),
              })),
            },
          };
        }
      }

      const draw = await app.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: request.user.id },
          select: {
            id: true,
            currency: true,
            specialCurrency: true,
          },
        });

        if (!user) {
          return { failure: "USER_NOT_FOUND" as const };
        }

        const spendFromCurrency = lootbox.spendCurrency === "currency";
        const balanceBefore = spendFromCurrency ? user.currency : user.specialCurrency;

        const deducted = spendFromCurrency
          ? await tx.user.updateMany({
            where: {
              id: request.user.id,
              currency: { gte: lootbox.cost },
            },
            data: {
              currency: { decrement: lootbox.cost },
            },
          })
          : await tx.user.updateMany({
            where: {
              id: request.user.id,
              specialCurrency: { gte: lootbox.cost },
            },
            data: {
              specialCurrency: { decrement: lootbox.cost },
            },
          });

        if (deducted.count === 0) {
          await tx.economyLog.create({
            data: {
              userId: request.user.id,
              eventType: "LOOTBOX_OPEN_BLOCKED",
              currencyType: lootbox.spendCurrency,
              amountDelta: 0,
              balanceBefore,
              balanceAfter: balanceBefore,
              reason: "INSUFFICIENT_FUNDS",
              metadata: JSON.stringify({ lootboxId: lootbox.id, requestId, cost: lootbox.cost }),
            },
          });

          return { failure: "INSUFFICIENT_FUNDS" as const };
        }

        const pick = pickEntryByCs2Odds(lootbox.items);
        if (!pick) {
          return { failure: "NO_ELIGIBLE_ITEMS" as const };
        }

        const selectedEntry = pick.selectedEntry;
        const now = new Date();

        const roll = await tx.lootboxRoll.create({
          data: {
            userId: request.user.id,
            lootboxId: lootbox.id,
            resultItemId: selectedEntry.itemId,
            costPaid: lootbox.cost,
            requestId,
            serverSeed: Math.random().toString(36).slice(2),
            rollValue: pick.trace.bucketRollValue,
            totalWeight: Math.round(pick.trace.totalChance * 100),
            dropTrace: JSON.stringify({
              mode: "cs2-official-bucket-odds",
              selectedBucket: pick.trace.selectedBucket,
              bucketPoolSize: pick.trace.bucketPoolSize,
              itemRollIndex: pick.trace.itemRollIndex,
              availableBuckets: pick.trace.availableBuckets,
              pool: lootbox.items.map((entry) => ({
                itemId: entry.itemId,
                rarity: entry.item.rarity,
                weaponType: entry.item.weaponType,
                legacyWeight: entry.weight,
              })),
            }),
            createdAt: now,
          },
        });

        const userAfterSpend = await tx.user.findUnique({
          where: { id: request.user.id },
          select: {
            currency: true,
            specialCurrency: true,
          },
        });

        if (!userAfterSpend) {
          return { failure: "USER_NOT_FOUND" as const };
        }

        await tx.economyLog.create({
          data: {
            userId: request.user.id,
            eventType: "LOOTBOX_OPEN_SPEND",
            currencyType: lootbox.spendCurrency,
            amountDelta: -lootbox.cost,
            balanceBefore,
            balanceAfter: spendFromCurrency ? userAfterSpend.currency : userAfterSpend.specialCurrency,
            reason: "LOOTBOX_COST",
            referenceId: roll.id,
            metadata: JSON.stringify({ lootboxId: lootbox.id, requestId }),
          },
        });

        const inventory = await tx.userItem.upsert({
          where: {
            userId_itemId: {
              userId: request.user.id,
              itemId: selectedEntry.itemId,
            },
          },
          update: {
            quantity: { increment: selectedEntry.quantity },
          },
          create: {
            userId: request.user.id,
            itemId: selectedEntry.itemId,
            quantity: selectedEntry.quantity,
          },
          select: {
            quantity: true,
            reservedForTrade: true,
            reservedForMarket: true,
          },
        });

        await tx.economyLog.create({
          data: {
            userId: request.user.id,
            eventType: "LOOTBOX_OPEN_REWARD",
            currencyType: lootbox.spendCurrency,
            amountDelta: 0,
            balanceBefore: spendFromCurrency ? userAfterSpend.currency : userAfterSpend.specialCurrency,
            balanceAfter: spendFromCurrency ? userAfterSpend.currency : userAfterSpend.specialCurrency,
            reason: "ITEM_GRANTED",
            referenceId: roll.id,
            metadata: JSON.stringify({
              lootboxId: lootbox.id,
              requestId,
              itemId: selectedEntry.item.id,
              quantity: selectedEntry.quantity,
            }),
          },
        });

        return {
          failure: null,
          roll,
          item: selectedEntry.item,
          inventory,
          balanceAfter: spendFromCurrency ? userAfterSpend.currency : userAfterSpend.specialCurrency,
        };
      });

      if (draw.failure === "INSUFFICIENT_FUNDS") {
        return reply.status(402).send({ error: "Insufficient balance to open this lootbox." });
      }

      if (draw.failure === "NO_ELIGIBLE_ITEMS") {
        return reply.status(422).send({ error: "This lootbox has no eligible items for CS2 odds selection." });
      }

      if (draw.failure) {
        return reply.status(404).send({ error: "User account no longer exists" });
      }

      return {
        result: {
          idempotentReplay: false,
          rollId: draw.roll.id,
          requestId: draw.roll.requestId,
          lootbox: {
            id: lootbox.id,
            name: lootbox.name,
            image: lootbox.image,
          },
          spent: {
            wallet: lootbox.spendCurrency,
            amount: lootbox.cost,
            balanceAfter: draw.balanceAfter,
          },
          item: {
            id: draw.item.id,
            name: draw.item.name,
            image: draw.item.image,
            description: draw.item.description,
            rarity: draw.item.rarity,
            marketPrice: Number(draw.item.realWorldValue),
            cs2: pickCs2Meta(draw.item),
          },
          inventory: draw.inventory,
          trace: {
            rollValue: draw.roll.rollValue,
            totalWeight: draw.roll.totalWeight,
          },
          createdAt: draw.roll.createdAt,
          pool: lootbox.items.map((entry) => ({
            id: entry.item.id,
            name: entry.item.name,
            image: entry.item.image,
            rarity: entry.item.rarity,
            weight: entry.weight,
            marketPrice: Number(entry.item.realWorldValue),
              cs2: pickCs2Meta(entry.item),
          })),
        },
      };
    },
  );

  app.post<{ Params: { id: string } }>("/:id/favorite", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params;
    if (!id?.trim()) {
      return reply.status(400).send({ error: "Lootbox id is required" });
    }

    const lootbox = await app.prisma.lootbox.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });

    if (!lootbox) {
      return reply.status(404).send({ error: "Lootbox not found" });
    }

    await app.prisma.lootboxFavorite.upsert({
      where: {
        userId_lootboxId: {
          userId: request.user.id,
          lootboxId: id,
        },
      },
      update: {},
      create: {
        userId: request.user.id,
        lootboxId: id,
      },
    });

    return reply.status(201).send({ success: true });
  });

  app.delete<{ Params: { id: string } }>("/:id/favorite", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params;
    if (!id?.trim()) {
      return reply.status(400).send({ error: "Lootbox id is required" });
    }

    await app.prisma.lootboxFavorite.deleteMany({
      where: {
        userId: request.user.id,
        lootboxId: id,
      },
    });

    return reply.status(204).send();
  });
};
