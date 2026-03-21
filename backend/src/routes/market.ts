import { FastifyPluginAsync } from "fastify";

type MarketSortBy = "new" | "price" | "wear" | "float";
type MarketSortDir = "asc" | "desc";
type WearTier = "Factory New" | "Minimal Wear" | "Field Tested" | "Worn";

type ListingQueryConfig = {
  userId?: string;
};

const PAGE_SIZES = new Set([10, 15, 30, 50]);
const WEAR_OPTIONS: WearTier[] = ["Factory New", "Minimal Wear", "Field Tested", "Worn"];

const WEAR_SORT_RANK: Record<WearTier, number> = {
  "Factory New": 1,
  "Minimal Wear": 2,
  "Field Tested": 3,
  Worn: 4,
};

class MarketRouteError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const toStringArray = (value: unknown): string[] => {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => (typeof entry === "string" ? entry.split(",") : []))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
};

const toLowerSet = (values: string[]) => new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));

const toInt = (value: unknown, fallback: number) => {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampPage = (value: unknown) => {
  const parsed = toInt(value, 1);
  return parsed < 1 ? 1 : parsed;
};

const parsePageSize = (value: unknown) => {
  const parsed = toInt(value, 10);
  return PAGE_SIZES.has(parsed) ? parsed : 10;
};

const parseSortBy = (value: unknown): MarketSortBy => {
  if (value === "price" || value === "wear" || value === "float") {
    return value;
  }

  return "new";
};

const parseSortDir = (value: unknown): MarketSortDir => {
  return value === "asc" ? "asc" : "desc";
};

const seededUnitValue = (seed: string) => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
};

const clampFloat = (value: number, min: number, max: number) => {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
};

const deriveFloat = (seed: string, wearMin: number | null, wearMax: number | null) => {
  const unit = seededUnitValue(seed);
  const resolvedMin = typeof wearMin === "number" ? wearMin : 0;
  const resolvedMax = typeof wearMax === "number" ? wearMax : 1;

  const min = Math.min(resolvedMin, resolvedMax);
  const max = Math.max(resolvedMin, resolvedMax);

  const generated = min + (max - min) * unit;
  return Number(clampFloat(generated, 0, 1).toFixed(4));
};

const deriveWear = (floatValue: number): WearTier => {
  if (floatValue <= 0.07) {
    return "Factory New";
  }
  if (floatValue <= 0.15) {
    return "Minimal Wear";
  }
  if (floatValue <= 0.38) {
    return "Field Tested";
  }

  return "Worn";
};

const parseMarketQuery = (query: Record<string, unknown>) => ({
  page: clampPage(query.page),
  pageSize: parsePageSize(query.pageSize),
  sortBy: parseSortBy(query.sortBy),
  sortDir: parseSortDir(query.sortDir),
  search: typeof query.search === "string" ? query.search.trim() : "",
  itemId: typeof query.itemId === "string" ? query.itemId.trim() : "",
  lootboxId: typeof query.lootboxId === "string" ? query.lootboxId.trim() : "",
  quantityMin: Math.max(0, toInt(query.quantityMin, 0)),
  wearFilter: toLowerSet(toStringArray(query.wear)),
  typeFilter: toLowerSet(toStringArray(query.type)),
  rarityFilter: toLowerSet(toStringArray(query.rarity)),
});

const fetchListingsPayload = async (
  app: Parameters<FastifyPluginAsync>[0],
  query: Record<string, unknown>,
  config: ListingQueryConfig = {},
) => {
  const parsed = parseMarketQuery(query);

  const listings = await app.prisma.marketListing.findMany({
    where: {
      isActive: true,
      ...(config.userId ? { userId: config.userId } : {}),
      ...(parsed.itemId ? { itemId: parsed.itemId } : {}),
      ...(parsed.lootboxId
        ? {
          item: {
            lootboxItems: {
              some: {
                lootboxId: parsed.lootboxId,
                lootbox: {
                  isActive: true,
                },
              },
            },
          },
        }
        : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
      },
      item: {
        select: {
          id: true,
          name: true,
          image: true,
          description: true,
          rarity: true,
          realWorldValue: true,
          weaponType: true,
          wearMin: true,
          wearMax: true,
        },
      },
    },
  });

  const itemIds = [...new Set(listings.map((listing) => listing.itemId))];

  const [activeLootboxItems, activeLootboxes] = await Promise.all([
    itemIds.length > 0
      ? app.prisma.lootboxItem.findMany({
        where: {
          itemId: {
            in: itemIds,
          },
          lootbox: {
            isActive: true,
          },
        },
        include: {
          lootbox: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })
      : Promise.resolve([]),
    app.prisma.lootbox.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  const activeLootboxesByItem = new Map<string, Array<{ id: string; name: string }>>();
  for (const entry of activeLootboxItems) {
    const current = activeLootboxesByItem.get(entry.itemId) ?? [];
    if (!current.some((lootbox) => lootbox.id === entry.lootbox.id)) {
      current.push(entry.lootbox);
      activeLootboxesByItem.set(entry.itemId, current);
    }
  }

  const formatted = listings.map((listing) => {
    const floatValue = deriveFloat(listing.id, listing.item.wearMin, listing.item.wearMax);
    const wear = deriveWear(floatValue);
    const activeLootboxMatches = activeLootboxesByItem.get(listing.itemId) ?? [];

    return {
      id: listing.id,
      createdAt: listing.createdAt,
      quantity: listing.quantity,
      listedPriceUsd: Number((listing.pricePerUnit / 100).toFixed(2)),
      seller: {
        id: listing.user.id,
        username: listing.user.username,
      },
      item: {
        id: listing.item.id,
        name: listing.item.name,
        image: listing.item.image,
        description: listing.item.description,
        rarity: listing.item.rarity,
        type: listing.item.weaponType,
        basePriceUsd: Number(listing.item.realWorldValue),
        float: floatValue,
        wear,
      },
      activeLootboxes: activeLootboxMatches,
    };
  });

  const searched = formatted.filter((listing) => {
    if (parsed.search.length >= 3) {
      const lowered = parsed.search.toLowerCase();
      if (!listing.item.name.toLowerCase().includes(lowered)) {
        return false;
      }
    }

    if (parsed.rarityFilter.size > 0 && !parsed.rarityFilter.has(listing.item.rarity.toLowerCase())) {
      return false;
    }

    if (parsed.wearFilter.size > 0 && !parsed.wearFilter.has(listing.item.wear.toLowerCase())) {
      return false;
    }

    if (parsed.typeFilter.size > 0) {
      const normalizedType = listing.item.type?.toLowerCase() ?? "";
      if (!parsed.typeFilter.has(normalizedType)) {
        return false;
      }
    }

    if (parsed.quantityMin > 0 && listing.quantity < parsed.quantityMin) {
      return false;
    }

    return true;
  });

  const sorted = searched.sort((a, b) => {
    if (parsed.sortBy === "new") {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return parsed.sortDir === "asc" ? diff : -diff;
    }

    if (parsed.sortBy === "price") {
      const diff = a.listedPriceUsd - b.listedPriceUsd;
      return parsed.sortDir === "asc" ? diff : -diff;
    }

    if (parsed.sortBy === "float") {
      const diff = a.item.float - b.item.float;
      return parsed.sortDir === "asc" ? diff : -diff;
    }

    const diff = WEAR_SORT_RANK[a.item.wear] - WEAR_SORT_RANK[b.item.wear];
    return parsed.sortDir === "asc" ? diff : -diff;
  });

  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / parsed.pageSize));
  const safePage = Math.min(parsed.page, totalPages);
  const start = (safePage - 1) * parsed.pageSize;
  const paged = sorted.slice(start, start + parsed.pageSize);

  const filterTypes = [
    ...new Set(
      formatted
        .map((listing) => listing.item.type)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const filterRarities = [...new Set(formatted.map((listing) => listing.item.rarity))].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    listings: paged,
    pagination: {
      page: safePage,
      pageSize: parsed.pageSize,
      totalItems,
      totalPages,
    },
    filters: {
      lootboxes: activeLootboxes,
      wear: WEAR_OPTIONS,
      types: filterTypes,
      rarities: filterRarities,
    },
  };
};

export const marketRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: Record<string, unknown> }>("/listings", { onRequest: [app.authenticate] }, async (request) => {
    return fetchListingsPayload(app, request.query);
  });

  app.get<{ Querystring: Record<string, unknown> }>(
    "/my-listings",
    { onRequest: [app.authenticate] },
    async (request) => {
      const [payload, user] = await Promise.all([
        fetchListingsPayload(app, request.query, { userId: request.user.id }),
        app.prisma.user.findUnique({
          where: { id: request.user.id },
          select: {
            currency: true,
            specialCurrency: true,
            inventory: {
              include: {
                item: {
                  select: {
                    realWorldValue: true,
                  },
                },
              },
            },
          },
        }),
      ]);

      const realWorldUsdEstimate = user
        ? Number(
          user.inventory.reduce((sum, entry) => sum + Number(entry.item.realWorldValue) * entry.quantity, 0).toFixed(2),
        )
        : 0;

      return {
        ...payload,
        account: {
          currency: user?.currency ?? 0,
          specialCurrency: user?.specialCurrency ?? 0,
          realWorldUsdEstimate,
        },
      };
    },
  );

  app.post<{ Body: { itemId: string; quantity: number; listedPriceUsd: number } }>(
    "/listings",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const itemId = request.body.itemId?.trim();
      const quantity = Number.isFinite(request.body.quantity) ? Math.floor(request.body.quantity) : 0;
      const listedPriceUsd = Number(request.body.listedPriceUsd);

      if (!itemId) {
        return reply.status(400).send({ error: "itemId is required" });
      }

      if (quantity < 1) {
        return reply.status(400).send({ error: "quantity must be at least 1" });
      }

      if (!Number.isFinite(listedPriceUsd) || listedPriceUsd <= 0) {
        return reply.status(400).send({ error: "listedPriceUsd must be greater than 0" });
      }

      const result = await app.prisma.$transaction(async (tx) => {
        const [item, user] = await Promise.all([
          tx.item.findUnique({ where: { id: itemId }, select: { id: true, name: true } }),
          tx.user.findUnique({ where: { id: request.user.id }, select: { currency: true } }),
        ]);

        if (!item || !user) {
          throw new MarketRouteError("INVALID_STATE", "User or item not found");
        }

        const inventory = await tx.userItem.findUnique({
          where: {
            userId_itemId: {
              userId: request.user.id,
              itemId,
            },
          },
          select: {
            quantity: true,
            reservedForTrade: true,
            reservedForMarket: true,
          },
        });

        if (!inventory) {
          throw new MarketRouteError("MISSING_INVENTORY", "Item not found in your inventory");
        }

        const availableQuantity = Math.max(0, inventory.quantity - inventory.reservedForTrade - inventory.reservedForMarket);
        if (availableQuantity < quantity) {
          throw new MarketRouteError("INSUFFICIENT_AVAILABLE", "Not enough available item quantity to list");
        }

        await tx.userItem.update({
          where: {
            userId_itemId: {
              userId: request.user.id,
              itemId,
            },
          },
          data: {
            reservedForMarket: {
              increment: quantity,
            },
          },
        });

        const listing = await tx.marketListing.create({
          data: {
            userId: request.user.id,
            itemId,
            quantity,
            pricePerUnit: Math.round(listedPriceUsd * 100),
            isActive: true,
          },
        });

        await tx.economyLog.create({
          data: {
            userId: request.user.id,
            eventType: "MARKET_ESCROW_HOLD",
            currencyType: "currency",
            amountDelta: 0,
            balanceBefore: user.currency,
            balanceAfter: user.currency,
            reason: "LISTING_CREATED",
            referenceId: listing.id,
            metadata: JSON.stringify({
              listingId: listing.id,
              itemId,
              itemName: item.name,
              quantity,
              listedPriceUsd,
            }),
          },
        });

        return listing;
      });

      return reply.status(201).send({
        success: true,
        listing: {
          id: result.id,
          itemId: result.itemId,
          quantity: result.quantity,
          listedPriceUsd: Number((result.pricePerUnit / 100).toFixed(2)),
          createdAt: result.createdAt,
        },
      });
    },
  );

  app.get<{ Params: { listingId: string } }>(
    "/listings/:listingId",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const listingId = request.params.listingId?.trim();
      if (!listingId) {
        return reply.status(400).send({ error: "Listing id is required" });
      }

      const listing = await app.prisma.marketListing.findUnique({
        where: {
          id: listingId,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
          item: {
            select: {
              id: true,
              name: true,
              image: true,
              description: true,
              rarity: true,
              realWorldValue: true,
              weaponType: true,
              wearMin: true,
              wearMax: true,
            },
          },
        },
      });

      if (!listing || !listing.isActive) {
        return reply.status(404).send({ error: "Listing not found" });
      }

      const activeLootboxes = await app.prisma.lootbox.findMany({
        where: {
          isActive: true,
          items: {
            some: {
              itemId: listing.itemId,
            },
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      const floatValue = deriveFloat(listing.id, listing.item.wearMin, listing.item.wearMax);

      return {
        listing: {
          id: listing.id,
          createdAt: listing.createdAt,
          quantity: listing.quantity,
          listedPriceUsd: Number((listing.pricePerUnit / 100).toFixed(2)),
          seller: {
            id: listing.user.id,
            username: listing.user.username,
          },
          item: {
            id: listing.item.id,
            name: listing.item.name,
            image: listing.item.image,
            description: listing.item.description,
            rarity: listing.item.rarity,
            type: listing.item.weaponType,
            basePriceUsd: Number(listing.item.realWorldValue),
            float: floatValue,
            wear: deriveWear(floatValue),
          },
          activeLootboxes,
        },
      };
    },
  );

  app.delete<{ Params: { listingId: string } }>(
    "/listings/:listingId",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const listingId = request.params.listingId?.trim();
      if (!listingId) {
        return reply.status(400).send({ error: "Listing id is required" });
      }

      try {
        const removed = await app.prisma.$transaction(async (tx) => {
          const [listing, user] = await Promise.all([
            tx.marketListing.findUnique({
              where: { id: listingId },
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
            }),
            tx.user.findUnique({ where: { id: request.user.id }, select: { currency: true } }),
          ]);

          if (!listing || !listing.isActive) {
            throw new MarketRouteError("LISTING_UNAVAILABLE", "Listing no longer available");
          }

          if (listing.userId !== request.user.id) {
            throw new MarketRouteError("FORBIDDEN", "You can only remove your own listing");
          }

          const deactivated = await tx.marketListing.updateMany({
            where: {
              id: listing.id,
              isActive: true,
              userId: request.user.id,
            },
            data: {
              isActive: false,
            },
          });

          if (deactivated.count === 0) {
            throw new MarketRouteError("LISTING_UNAVAILABLE", "Listing no longer available");
          }

          const released = await tx.userItem.updateMany({
            where: {
              userId: request.user.id,
              itemId: listing.itemId,
              reservedForMarket: {
                gte: listing.quantity,
              },
            },
            data: {
              reservedForMarket: {
                decrement: listing.quantity,
              },
            },
          });

          if (released.count === 0) {
            throw new MarketRouteError("ESCROW_MISMATCH", "Reserved market quantity is out of sync");
          }

          await tx.economyLog.create({
            data: {
              userId: request.user.id,
              eventType: "MARKET_ESCROW_RELEASE",
              currencyType: "currency",
              amountDelta: 0,
              balanceBefore: user?.currency ?? 0,
              balanceAfter: user?.currency ?? 0,
              reason: "LISTING_REMOVED",
              referenceId: listing.id,
              metadata: JSON.stringify({
                listingId: listing.id,
                itemId: listing.itemId,
                itemName: listing.item.name,
                quantity: listing.quantity,
              }),
            },
          });

          return {
            listingId: listing.id,
            quantity: listing.quantity,
            listedPriceUsd: Number((listing.pricePerUnit / 100).toFixed(2)),
            item: {
              id: listing.item.id,
              name: listing.item.name,
              image: listing.item.image,
              rarity: listing.item.rarity,
              marketPrice: Number(listing.item.realWorldValue),
            },
          };
        });

        return { success: true, removed };
      } catch (error) {
        if (error instanceof MarketRouteError) {
          if (error.code === "FORBIDDEN") {
            return reply.status(403).send({ error: error.message });
          }
          if (error.code === "LISTING_UNAVAILABLE") {
            return reply.status(410).send({ error: error.message });
          }
          if (error.code === "ESCROW_MISMATCH") {
            return reply.status(409).send({ error: error.message });
          }
          return reply.status(400).send({ error: error.message });
        }

        request.log.error(error, "market listing removal failed");
        return reply.status(500).send({ error: "Failed to remove listing" });
      }
    },
  );

  app.post<{ Params: { listingId: string } }>(
    "/listings/:listingId/purchase",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const listingId = request.params.listingId?.trim();
      if (!listingId) {
        return reply.status(400).send({ error: "Listing id is required" });
      }

      try {
        const result = await app.prisma.$transaction(async (tx) => {
          const listing = await tx.marketListing.findUnique({
            where: {
              id: listingId,
            },
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
          });

          if (!listing || !listing.isActive) {
            throw new MarketRouteError("LISTING_UNAVAILABLE", "Listing no longer available");
          }

          if (listing.userId === request.user.id) {
            throw new MarketRouteError("OWN_LISTING", "You cannot buy your own listing");
          }

          const [buyer, seller] = await Promise.all([
            tx.user.findUnique({ where: { id: request.user.id }, select: { currency: true } }),
            tx.user.findUnique({ where: { id: listing.userId }, select: { currency: true } }),
          ]);

          const claimed = await tx.marketListing.updateMany({
            where: {
              id: listing.id,
              isActive: true,
            },
            data: {
              isActive: false,
            },
          });

          if (claimed.count === 0) {
            throw new MarketRouteError("LISTING_UNAVAILABLE", "Listing no longer available");
          }

          const sellerUpdated = await tx.userItem.updateMany({
            where: {
              userId: listing.userId,
              itemId: listing.itemId,
              quantity: {
                gte: listing.quantity,
              },
              reservedForMarket: {
                gte: listing.quantity,
              },
            },
            data: {
              quantity: {
                decrement: listing.quantity,
              },
              reservedForMarket: {
                decrement: listing.quantity,
              },
            },
          });

          if (sellerUpdated.count === 0) {
            throw new MarketRouteError("SELLER_STOCK_INVALID", "Seller inventory no longer satisfies listing");
          }

          const buyerItem = await tx.userItem.upsert({
            where: {
              userId_itemId: {
                userId: request.user.id,
                itemId: listing.itemId,
              },
            },
            update: {
              quantity: {
                increment: listing.quantity,
              },
            },
            create: {
              userId: request.user.id,
              itemId: listing.itemId,
              quantity: listing.quantity,
            },
            select: {
              quantity: true,
              reservedForTrade: true,
              reservedForMarket: true,
            },
          });

          await tx.economyLog.createMany({
            data: [
              {
                userId: request.user.id,
                eventType: "MARKET_ESCROW_TRANSFER_IN",
                currencyType: "currency",
                amountDelta: 0,
                balanceBefore: buyer?.currency ?? 0,
                balanceAfter: buyer?.currency ?? 0,
                reason: "SIMULATED_PURCHASE",
                referenceId: listing.id,
                metadata: JSON.stringify({
                  listingId: listing.id,
                  itemId: listing.itemId,
                  quantity: listing.quantity,
                  fromUserId: listing.userId,
                  toUserId: request.user.id,
                  listedPriceUsd: Number((listing.pricePerUnit / 100).toFixed(2)),
                }),
              },
              {
                userId: listing.userId,
                eventType: "MARKET_ESCROW_TRANSFER_OUT",
                currencyType: "currency",
                amountDelta: 0,
                balanceBefore: seller?.currency ?? 0,
                balanceAfter: seller?.currency ?? 0,
                reason: "SIMULATED_SALE",
                referenceId: listing.id,
                metadata: JSON.stringify({
                  listingId: listing.id,
                  itemId: listing.itemId,
                  quantity: listing.quantity,
                  fromUserId: listing.userId,
                  toUserId: request.user.id,
                  listedPriceUsd: Number((listing.pricePerUnit / 100).toFixed(2)),
                }),
              },
            ],
          });

          return {
            listingId: listing.id,
            quantity: listing.quantity,
            listedPriceUsd: Number((listing.pricePerUnit / 100).toFixed(2)),
            item: {
              id: listing.item.id,
              name: listing.item.name,
              image: listing.item.image,
              rarity: listing.item.rarity,
              marketPrice: Number(listing.item.realWorldValue),
            },
            buyerInventory: buyerItem,
          };
        });

        return {
          success: true,
          purchase: result,
        };
      } catch (error) {
        if (error instanceof MarketRouteError) {
          if (error.code === "OWN_LISTING") {
            return reply.status(400).send({ error: error.message });
          }

          if (error.code === "LISTING_UNAVAILABLE") {
            return reply.status(410).send({ error: error.message });
          }

          if (error.code === "SELLER_STOCK_INVALID") {
            return reply.status(409).send({ error: error.message });
          }

          return reply.status(400).send({ error: error.message });
        }

        request.log.error(error, "market purchase failed");
        return reply.status(500).send({ error: "Failed to purchase listing" });
      }
    },
  );
};
