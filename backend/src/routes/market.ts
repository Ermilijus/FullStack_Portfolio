import { FastifyPluginAsync } from "fastify";

type MarketSortBy = "new" | "price" | "wear" | "float";
type MarketSortDir = "asc" | "desc";
type WearTier = "Factory New" | "Minimal Wear" | "Field-Tested" | "Well-Worn" | "Battle-Scarred";

type ListingQueryConfig = {
  userId?: string;
  expandByQuantity?: boolean;
};

const RARITY_CANONICAL: Record<string, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

const TYPE_CANONICAL: Record<string, string> = {
  rifle: "Rifle",
  "sniper rifle": "Sniper Rifle",
  smg: "SMG",
  machinegun: "Machinegun",
  shotgun: "Shotgun",
  pistol: "Pistol",
  knife: "Knife",
  gloves: "Gloves",
};

const CATALOG_TYPES = ["Rifle", "Sniper Rifle", "SMG", "Machinegun", "Shotgun", "Pistol", "Knife", "Gloves"];

const deriveWeaponCatalogName = (itemName: string, fallbackType: string | null) => {
  const trimmed = itemName.trim();
  if (!trimmed) {
    return fallbackType ?? "Unknown";
  }

  const [head] = trimmed.split("|");
  const withoutStar = head.replace(/^★\s*/u, "").trim();
  return withoutStar.length > 0 ? withoutStar : fallbackType ?? "Unknown";
};

const PAGE_SIZES = new Set([10, 15, 30, 50]);
const WEAR_OPTIONS: WearTier[] = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];

const WEAR_SORT_RANK: Record<WearTier, number> = {
  "Factory New": 1,
  "Minimal Wear": 2,
  "Field-Tested": 3,
  "Well-Worn": 4,
  "Battle-Scarred": 5,
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
  return Number(clampFloat(generated, 0, 1).toFixed(6));
};

const deriveWear = (floatValue: number): WearTier => {
  if (floatValue <= 0.07) {
    return "Factory New";
  }
  if (floatValue <= 0.15) {
    return "Minimal Wear";
  }
  if (floatValue <= 0.38) {
    return "Field-Tested";
  }
  if (floatValue <= 0.45) {
    return "Well-Worn";
  }

  return "Battle-Scarred";
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

const fetchListingsPayload = async (
  app: Parameters<FastifyPluginAsync>[0],
  query: Record<string, unknown>,
  config: ListingQueryConfig = {},
) => {
  const parsed = parseMarketQuery(query);
  const rarityFilterDb = [...parsed.rarityFilter]
    .map((value) => RARITY_CANONICAL[value])
    .filter((value): value is string => Boolean(value));
  const typeFilterDb = [...parsed.typeFilter]
    .map((value) => TYPE_CANONICAL[value])
    .filter((value): value is string => Boolean(value));
  const itemWhere = {
    ...(parsed.search.length >= 3
      ? {
        name: {
          contains: parsed.search,
          mode: "insensitive" as const,
        },
      }
      : {}),
    ...(rarityFilterDb.length > 0
      ? {
        rarity: {
          in: rarityFilterDb,
        },
      }
      : {}),
    ...(typeFilterDb.length > 0
      ? {
        weaponType: {
          in: typeFilterDb,
        },
      }
      : {}),
    ...(parsed.lootboxId
      ? {
        lootboxItems: {
          some: {
            lootboxId: parsed.lootboxId,
            lootbox: {
              isActive: true,
            },
          },
        },
      }
      : {}),
  };

  const listings = await app.prisma.marketListing.findMany({
    where: {
      isActive: true,
      ...(config.userId ? { userId: config.userId } : {}),
      ...(parsed.quantityMin > 0 ? { quantity: { gte: parsed.quantityMin } } : {}),
      ...(parsed.itemId ? { itemId: parsed.itemId } : {}),
      ...(Object.keys(itemWhere).length > 0 ? { item: itemWhere } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          avatar: true,
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
          isCs2: true,
          sourceDefIndex: true,
          sourcePaintIndex: true,
          sourceQuality: true,
          sourcePhase: true,
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
        avatar: listing.user.avatar,
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
        cs2: pickCs2Meta(listing.item),
      },
      activeLootboxes: activeLootboxMatches,
    };
  });

  const expanded = (config.expandByQuantity ?? true)
    ? formatted.flatMap((listing) =>
      Array.from({ length: Math.max(1, listing.quantity) }, () => ({
        ...listing,
        quantity: 1,
      })),
    )
    : formatted;

  const searched = expanded.filter((listing) => {
    if (parsed.wearFilter.size > 0 && !parsed.wearFilter.has(listing.item.wear.toLowerCase())) {
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
      expanded
        .map((listing) => listing.item.type)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const filterRarities = [...new Set(expanded.map((listing) => listing.item.rarity))].sort((a, b) =>
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
  app.get<{ Querystring: Record<string, unknown> }>("/catalog", { onRequest: [app.authenticate] }, async (request) => {
    const itemType = typeof request.query.itemType === "string" ? request.query.itemType.trim() : "";
    const weaponName = typeof request.query.weaponName === "string" ? request.query.weaponName.trim() : "";

    if (itemType) {
      const [items, counts] = await Promise.all([
        app.prisma.item.findMany({
          where: {
            weaponType: itemType,
          },
          select: {
            id: true,
            name: true,
            image: true,
            rarity: true,
            weaponType: true,
            isCs2: true,
            sourceDefIndex: true,
            sourcePaintIndex: true,
            sourceQuality: true,
            sourcePhase: true,
          },
        }),
        app.prisma.marketListing.groupBy({
          by: ["itemId"],
          where: {
            isActive: true,
            quantity: {
              gt: 0,
            },
            item: {
              weaponType: itemType,
            },
          },
          _sum: {
            quantity: true,
          },
        }),
      ]);

      const activeByItemId = new Map<string, number>(
        counts.map((entry) => [entry.itemId, entry._sum.quantity ?? 0]),
      );

      if (!weaponName) {
        const grouped = new Map<string, { itemCount: number; listingCount: number; covertImages: string[]; images: string[] }>();

        for (const item of items) {
          const key = deriveWeaponCatalogName(item.name, item.weaponType);
          const current = grouped.get(key) ?? { itemCount: 0, listingCount: 0, covertImages: [], images: [] };
          current.itemCount += 1;
          current.listingCount += activeByItemId.get(item.id) ?? 0;

          if (item.image) {
            current.images.push(item.image);
            if (item.rarity.trim().toLowerCase() === "covert") {
              current.covertImages.push(item.image);
            }
          }

          grouped.set(key, current);
        }

        const weapons = [...grouped.entries()]
          .map(([name, stats]) => {
            const covertPool = stats.covertImages;
            const fallbackPool = stats.images;
            const image = covertPool.length > 0
              ? covertPool[Math.floor(Math.random() * covertPool.length)] ?? null
              : fallbackPool[Math.floor(Math.random() * fallbackPool.length)] ?? null;

            return {
              weaponName: name,
              image,
              listingCount: stats.listingCount,
              itemCount: stats.itemCount,
            };
          })
          .sort((left, right) => {
            const listingDiff = right.listingCount - left.listingCount;
            if (listingDiff !== 0) {
              return listingDiff;
            }

            const itemDiff = right.itemCount - left.itemCount;
            if (itemDiff !== 0) {
              return itemDiff;
            }

            return left.weaponName.localeCompare(right.weaponName);
          });

        return {
          mode: "weapons",
          itemType,
          weapons,
        };
      }

      const typedItems = items
        .filter((item) => deriveWeaponCatalogName(item.name, item.weaponType) === weaponName)
        .map((item) => ({
          id: item.id,
          name: item.name,
          image: item.image,
          rarity: item.rarity,
          classification: item.weaponType,
          activeListingCount: activeByItemId.get(item.id) ?? 0,
          cs2: pickCs2Meta(item),
        }))
        .sort((left, right) => {
          const countDiff = right.activeListingCount - left.activeListingCount;
          if (countDiff !== 0) {
            return countDiff;
          }

          return left.name.localeCompare(right.name);
        });

      return {
        mode: "items",
        itemType,
        weaponName,
        items: typedItems,
      };
    }

    const [counts, covertCandidates, fallbackCandidates] = await Promise.all([
      app.prisma.marketListing.groupBy({
        by: ["itemId"],
        where: {
          isActive: true,
          quantity: {
            gt: 0,
          },
          item: {
            weaponType: {
              in: CATALOG_TYPES,
            },
          },
        },
        _sum: {
          quantity: true,
        },
      }),
      app.prisma.item.findMany({
        where: {
          weaponType: {
            in: CATALOG_TYPES,
          },
          rarity: "Covert",
        },
        select: {
          weaponType: true,
          image: true,
        },
      }),
      app.prisma.item.findMany({
        where: {
          weaponType: {
            in: CATALOG_TYPES,
          },
        },
        select: {
          weaponType: true,
          name: true,
          image: true,
        },
      }),
    ]);

    const itemIds = counts.map((entry) => entry.itemId);
    const idToType = itemIds.length > 0
      ? new Map(
        (
          await app.prisma.item.findMany({
            where: {
              id: {
                in: itemIds,
              },
            },
            select: {
              id: true,
              weaponType: true,
            },
          })
        ).map((item) => [item.id, item.weaponType]),
      )
      : new Map<string, string | null>();

    const typeStats = new Map<string, { listingCount: number; weaponSet: Set<string> }>();
    for (const type of CATALOG_TYPES) {
      typeStats.set(type, { listingCount: 0, weaponSet: new Set<string>() });
    }

    for (const entry of counts) {
      const typeName = idToType.get(entry.itemId);
      if (!typeName || !typeStats.has(typeName)) {
        continue;
      }

      const current = typeStats.get(typeName)!;
      current.listingCount += entry._sum.quantity ?? 0;
    }

    for (const item of fallbackCandidates) {
      const typeName = item.weaponType;
      if (!typeName || !typeStats.has(typeName)) {
        continue;
      }

      const current = typeStats.get(typeName)!;
      current.weaponSet.add(deriveWeaponCatalogName(item.name, typeName));
    }

    const covertByType = new Map<string, string | null>();
    for (const type of CATALOG_TYPES) {
      const pool = covertCandidates.filter((item) => item.weaponType === type && item.image).map((item) => item.image);
      if (pool.length > 0) {
        covertByType.set(type, pool[Math.floor(Math.random() * pool.length)] ?? null);
      }
    }

    const fallbackByType = new Map<string, string | null>();
    for (const type of CATALOG_TYPES) {
      const pool = fallbackCandidates.filter((item) => item.weaponType === type && item.image).map((item) => item.image);
      if (pool.length > 0) {
        fallbackByType.set(type, pool[Math.floor(Math.random() * pool.length)] ?? null);
      }
    }

    const types = CATALOG_TYPES.map((type) => {
      const stats = typeStats.get(type)!;
      return {
        type,
        image: covertByType.get(type) ?? fallbackByType.get(type) ?? null,
        listingCount: stats.listingCount,
        itemCount: stats.weaponSet.size,
      };
    });

    return {
      mode: "types",
      types,
    };
  });

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

      if (quantity !== 1) {
        return reply.status(400).send({ error: "Listings must be created with quantity equal to 1" });
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
        if (availableQuantity < 1) {
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
              increment: 1,
            },
          },
        });

        const listing = await tx.marketListing.create({
          data: {
            userId: request.user.id,
            itemId,
            quantity: 1,
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
              quantity: 1,
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
          quantity: 1,
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
              avatar: true,
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
              isCs2: true,
              sourceDefIndex: true,
              sourcePaintIndex: true,
              sourceQuality: true,
              sourcePhase: true,
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
            avatar: listing.user.avatar,
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
            cs2: pickCs2Meta(listing.item),
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
              quantity: {
                gte: 1,
              },
            },
            data:
              listing.quantity <= 1
                ? {
                  quantity: {
                    decrement: 1,
                  },
                  isActive: false,
                }
                : {
                  quantity: {
                    decrement: 1,
                  },
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
                gte: 1,
              },
            },
            data: {
              reservedForMarket: {
                decrement: 1,
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
                quantity: 1,
              }),
            },
          });

          return {
            listingId: listing.id,
            quantity: 1,
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
              quantity: {
                gte: 1,
              },
            },
            data:
              listing.quantity <= 1
                ? {
                  quantity: {
                    decrement: 1,
                  },
                  isActive: false,
                }
                : {
                  quantity: {
                    decrement: 1,
                  },
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
                gte: 1,
              },
              reservedForMarket: {
                gte: 1,
              },
            },
            data: {
              quantity: {
                decrement: 1,
              },
              reservedForMarket: {
                decrement: 1,
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
                increment: 1,
              },
            },
            create: {
              userId: request.user.id,
              itemId: listing.itemId,
              quantity: 1,
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
                  quantity: 1,
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
                  quantity: 1,
                  fromUserId: listing.userId,
                  toUserId: request.user.id,
                  listedPriceUsd: Number((listing.pricePerUnit / 100).toFixed(2)),
                }),
              },
            ],
          });

          return {
            listingId: listing.id,
            quantity: 1,
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
