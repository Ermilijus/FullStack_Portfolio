import { FastifyPluginAsync } from "fastify";

type AdjustCurrencyBody = {
  userIds: string[];
  amount: number; // Can be positive (add) or negative (subtract)
  currencyType?: "currency" | "specialCurrency"; // Defaults to "currency"
};

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // ── Admin: adjust user currency ──────────────────────────────────────────
  app.post<{ Body: AdjustCurrencyBody }>(
    "/adjust-currency",
    { onRequest: [app.authenticate, app.authorizeAdmin] },
    async (request, reply) => {
      const { userIds, amount, currencyType = "currency" } = request.body;

      // Validation
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return reply.status(400).send({ error: "userIds must be a non-empty array" });
      }

      if (typeof amount !== "number" || !Number.isFinite(amount)) {
        return reply.status(400).send({ error: "amount must be a valid number" });
      }

      if (!["currency", "specialCurrency"].includes(currencyType)) {
        return reply
          .status(400)
          .send({ error: "currencyType must be 'currency' or 'specialCurrency'" });
      }

      try {
        // Fetch all target users to get current balances
        const users = await app.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            username: true,
            currency: true,
            specialCurrency: true,
          },
        });

        if (users.length === 0) {
          return reply.status(404).send({ error: "No users found with the provided IDs" });
        }

        // Update each user's currency
        const updateData = currencyType === "currency"
          ? { currency: { increment: amount } }
          : { specialCurrency: { increment: amount } };

        const updated = await Promise.all(
          users.map((user) =>
            app.prisma.user.update({
              where: { id: user.id },
              data: updateData,
              select: {
                id: true,
                username: true,
                currency: true,
                specialCurrency: true,
              },
            })
          )
        );

        return {
          success: true,
          message: `Adjusted ${currencyType} for ${users.length} user(s)`,
          updated,
        };
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: "Failed to adjust currency. Please check the user IDs and try again.",
        });
      }
    }
  );

  // ── Admin: get all users (for Currency Manager dropdown) ──────────────────
  app.get(
    "/users",
    { onRequest: [app.authenticate, app.authorizeAdmin] },
    async () => {
      const users = await app.prisma.user.findMany({
        select: {
          id: true,
          username: true,
          avatar: true,
          currency: true,
          specialCurrency: true,
          role: true,
        },
        orderBy: { username: "asc" },
      });

      return { users };
    }
  );
};
