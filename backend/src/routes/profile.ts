import { FastifyPluginAsync } from "fastify";

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get("/inventory", { onRequest: [app.authenticate] }, async (request) => {
    const inventory = await app.prisma.userItem.findMany({
      where: { userId: request.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            image: true,
            rarity: true,
            description: true,
            realWorldValue: true,
          },
        },
      },
    });

    return {
      items: inventory.map((entry) => {
        const availableQuantity = Math.max(0, entry.quantity - entry.reservedForTrade - entry.reservedForMarket);

        return {
          id: entry.id,
          quantity: entry.quantity,
          availableQuantity,
          reservedForTrade: entry.reservedForTrade,
          reservedForMarket: entry.reservedForMarket,
          item: {
            id: entry.item.id,
            name: entry.item.name,
            image: entry.item.image,
            rarity: entry.item.rarity,
            description: entry.item.description,
            marketPrice: Number(entry.item.realWorldValue),
          },
        };
      }),
    };
  });

  // ── Update avatar URL ─────────────────────────────────────────────────────
  app.put<{ Body: { avatarUrl: string } }>(
    "/avatar",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const { avatarUrl } = request.body;

      if (!avatarUrl || typeof avatarUrl !== "string") {
        return reply.status(400).send({ error: "avatarUrl is required" });
      }

      // Only allow http/https URLs (basic boundary validation)
      if (!/^https?:\/\/.+/.test(avatarUrl)) {
        return reply.status(400).send({ error: "avatarUrl must be a valid http or https URL" });
      }

      const user = await app.prisma.user.update({
        where: { id: request.user.id },
        data: { avatar: avatarUrl },
        select: { id: true, username: true, email: true, role: true, avatar: true },
      });

      return { user };
    },
  );
};
