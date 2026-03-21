import { FastifyPluginAsync } from "fastify";

const OPEN_RATE_WINDOW_MS = 60_000;
const OPEN_RATE_MAX_REQUESTS = 8;

const pickWeightedIndex = (weights: number[]) => {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const rollValue = Math.random() * totalWeight;

  let cursor = rollValue;
  let selectedIndex = 0;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) {
      selectedIndex = index;
      break;
    }
  }

  return {
    selectedIndex,
    rollValue,
    totalWeight,
  };
};

export const lootboxRoutes: FastifyPluginAsync = async (app) => {
  app.get("/catalog", { onRequest: [app.authenticate] }, async (request) => {
    const [lootboxes, favorites] = await Promise.all([
      app.prisma.lootbox.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            orderBy: [{ weight: "desc" }, { createdAt: "asc" }],
            include: {
              item: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  rarity: true,
                  realWorldValue: true,
                },
              },
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
        const previewItems = lootbox.items.slice(0, 5).map((entry) => ({
          id: entry.item.id,
          name: entry.item.name,
          image: entry.item.image,
          rarity: entry.item.rarity,
          marketPrice: Number(entry.item.realWorldValue),
          weight: entry.weight,
          quantity: entry.quantity,
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
          totalDropPoolItems: lootbox.items.length,
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
      },
    });
    const recentItemMap = new Map(recentItems.map((item) => [item.id, item]));

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
          quantity: entry.quantity,
        })),
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
              },
            };
          })
          .filter((drop): drop is NonNullable<typeof drop> => Boolean(drop)),
      },
    };
  });

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

        const weights = lootbox.items.map((entry) => Math.max(1, entry.weight));
        const pick = pickWeightedIndex(weights);
        const selectedEntry = lootbox.items[pick.selectedIndex];
        const now = new Date();

        const roll = await tx.lootboxRoll.create({
          data: {
            userId: request.user.id,
            lootboxId: lootbox.id,
            resultItemId: selectedEntry.itemId,
            costPaid: lootbox.cost,
            requestId,
            serverSeed: Math.random().toString(36).slice(2),
            rollValue: pick.rollValue,
            totalWeight: pick.totalWeight,
            dropTrace: JSON.stringify(
              lootbox.items.map((entry) => ({
                itemId: entry.itemId,
                weight: entry.weight,
              })),
            ),
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
