import { FastifyPluginAsync } from "fastify";

export const homeDataRoutes: FastifyPluginAsync = async (app) => {
  // ── Trending Forum Posts ─────────────────────────────────────────────────
  // Score: replyCount / (hoursElapsed + 2)^1.5 — top 5 from the last 30 days
  app.get("/trending-posts", { onRequest: [app.authenticate] }, async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const posts = await app.prisma.forumPost.findMany({
      where: { createdAt: { gte: since } },
      include: {
        user: { select: { username: true, avatar: true } },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50, // pull up to 50 recent, then score in-app
    });

    const now = Date.now();
    const scored = posts
      .map((post) => {
        const hoursElapsed = (now - post.createdAt.getTime()) / 3_600_000;
        const score = post._count.replies / Math.pow(hoursElapsed + 2, 1.5);
        return { post, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return {
      posts: scored.map(({ post }) => ({
        id: post.id,
        title: post.title,
        replyCount: post._count.replies,
        createdAt: post.createdAt,
        author: {
          username: post.user.username,
          avatar: post.user.avatar,
        },
      })),
    };
  });

  // ── Recent Legendary Drops ───────────────────────────────────────────────
  // Last 4 LootboxRolls where the resulting item is Legendary
  app.get("/recent-drops", { onRequest: [app.authenticate] }, async () => {
    // Fetch recent rolls then filter by rarity in-app (SQLite lacks JSON queries)
    const rolls = await app.prisma.lootboxRoll.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { username: true } },
        lootbox: { select: { name: true } },
      },
    });

    // Batch-fetch unique item ids to check rarity
    const itemIds = [...new Set(rolls.map((r) => r.resultItemId))];
    const items = await app.prisma.item.findMany({
      where: { id: { in: itemIds }, rarity: "Legendary" },
      select: { id: true, name: true, image: true, rarity: true },
    });
    const legendaryMap = new Map(items.map((i) => [i.id, i]));

    const legendaryRolls = rolls
      .filter((r) => legendaryMap.has(r.resultItemId))
      .slice(0, 4);

    return {
      drops: legendaryRolls.map((roll) => {
        const item = legendaryMap.get(roll.resultItemId)!;
        return {
          id: roll.id,
          item: { name: item.name, image: item.image, rarity: item.rarity },
          droppedBy: roll.user.username,
          lootboxName: roll.lootbox.name,
          createdAt: roll.createdAt,
        };
      }),
    };
  });
};
