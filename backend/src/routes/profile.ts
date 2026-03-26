import { FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isHttpAvatarUrl = (value: string) => /^https?:\/\/.+/.test(value);
const isAllowedAvatarDataUrl = (value: string) => /^data:(image\/(png|jpeg|gif|webp)|video\/webm);base64,[a-zA-Z0-9+/=]+$/.test(value);
const isValidAvatarUrl = (value: string) => isHttpAvatarUrl(value) || isAllowedAvatarDataUrl(value);

const buildProfileStats = async (app: Parameters<FastifyPluginAsync>[0], userId: string) => {
  const [inventoryCount, favoritesCount, postCount, replyCount] = await Promise.all([
    app.prisma.userItem.aggregate({
      where: { userId },
      _sum: { quantity: true },
    }),
    app.prisma.lootboxFavorite.count({ where: { userId } }),
    app.prisma.forumPost.count({ where: { userId } }),
    app.prisma.forumReply.count({ where: { userId } }),
  ]);

  return {
    inventoryItems: inventoryCount._sum.quantity ?? 0,
    favoriteLootboxes: favoritesCount,
    posts: postCount,
    replies: replyCount,
    reputation: postCount * 3 + replyCount * 2 + favoritesCount,
  };
};

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        avatar: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    return {
      user: {
        ...user,
        stats: await buildProfileStats(app, user.id),
      },
    };
  });

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

  app.put<{ Body: { avatarUrl: string } }>(
    "/avatar",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const avatarUrl = request.body?.avatarUrl?.trim();

      if (!avatarUrl) {
        return reply.status(400).send({ error: "avatarUrl is required" });
      }

      if (!isValidAvatarUrl(avatarUrl)) {
        return reply.status(400).send({ error: "avatarUrl must be an http/https URL or a supported base64 data URL" });
      }

      const user = await app.prisma.user.update({
        where: { id: request.user.id },
        data: { avatar: avatarUrl },
        select: { id: true, username: true, email: true, role: true, avatar: true },
      });

      return { user };
    },
  );

  app.put<{ Body: { username: string } }>(
    "/username",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const username = request.body?.username?.trim();

      if (!username || username.length < 3) {
        return reply.status(400).send({ error: "username must be at least 3 characters" });
      }

      if (username.length > 24) {
        return reply.status(400).send({ error: "username must be 24 characters or fewer" });
      }

      const conflict = await app.prisma.user.findFirst({
        where: {
          username,
          id: { not: request.user.id },
        },
        select: { id: true },
      });

      if (conflict) {
        return reply.status(409).send({ error: "Username is already in use" });
      }

      const updated = await app.prisma.user.update({
        where: { id: request.user.id },
        data: { username },
        select: { id: true, username: true, email: true, role: true, avatar: true },
      });

      return { user: updated };
    },
  );

  app.put<{ Body: { email: string; currentPassword: string } }>(
    "/email",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const email = request.body?.email?.trim().toLowerCase();
      const currentPassword = request.body?.currentPassword ?? "";

      if (!email || !isValidEmail(email)) {
        return reply.status(400).send({ error: "A valid email is required" });
      }

      if (!currentPassword) {
        return reply.status(400).send({ error: "currentPassword is required" });
      }

      const user = await app.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { id: true, passwordHash: true },
      });

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      const matches = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!matches) {
        return reply.status(401).send({ error: "Current password is incorrect" });
      }

      const emailTaken = await app.prisma.user.findFirst({
        where: {
          email,
          id: { not: user.id },
        },
        select: { id: true },
      });

      if (emailTaken) {
        return reply.status(409).send({ error: "Email is already in use" });
      }

      const updated = await app.prisma.user.update({
        where: { id: user.id },
        data: { email },
        select: { id: true, username: true, email: true, role: true, avatar: true },
      });

      return { user: updated };
    },
  );

  app.put<{ Body: { currentPassword: string; newPassword: string } }>(
    "/password",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const currentPassword = request.body?.currentPassword ?? "";
      const newPassword = request.body?.newPassword ?? "";

      if (!currentPassword || !newPassword) {
        return reply.status(400).send({ error: "currentPassword and newPassword are required" });
      }

      if (newPassword.length < 6) {
        return reply.status(400).send({ error: "newPassword must be at least 6 characters" });
      }

      const user = await app.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { id: true, passwordHash: true },
      });

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      const matches = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!matches) {
        return reply.status(401).send({ error: "Current password is incorrect" });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await app.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      return { success: true };
    },
  );

  app.get<{ Params: { userId: string } }>("/:userId/posts", async (request) => {
    const posts = await app.prisma.forumPost.findMany({
      where: { userId: request.params.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { replies: true } },
      },
    });

    return {
      posts: posts.map((post) => ({
        id: post.id,
        title: post.title,
        content: post.content,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        replyCount: post._count.replies,
        category: post.category,
      })),
    };
  });

  app.get<{ Params: { userId: string } }>("/:userId/replies", async (request) => {
    const replies = await app.prisma.forumReply.findMany({
      where: { userId: request.params.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        post: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    return {
      replies: replies.map((reply) => ({
        id: reply.id,
        content: reply.content,
        createdAt: reply.createdAt,
        updatedAt: reply.updatedAt,
        post: reply.post,
      })),
    };
  });

  app.get<{ Params: { userId: string } }>("/:userId", async (request, reply) => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.params.userId },
      select: {
        id: true,
        username: true,
        role: true,
        avatar: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    return {
      user: {
        ...user,
        stats: await buildProfileStats(app, user.id),
      },
    };
  });
};