import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { createAuthToken } from "../services/authToken.js";

export const registerAuthRoutes = async (app: FastifyInstance) => {
  // Login endpoint
  app.post<{ Body: { email: string; password: string } }>(
    "/api/login",
    async (request, reply) => {
      const { email, password } = request.body;

      // Find user by email
      const user = await app.prisma.user.findUnique({
        where: { email },
      });

      // If user doesn't exist OR password doesn't match, return 401
      if (!user) {
        return reply.status(401).send({ error: "Invalid email or password" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return reply.status(401).send({ error: "Invalid email or password" });
      }

      // Password is correct — generate JWT token
      const token = createAuthToken({
        id: user.id,
        email: user.email,
      }, app.config.JWT_SECRET);

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          avatar: user.avatar,
        },
      });
    }
  );

  // Get current user (protected route)
  app.get<{}>("/api/me", { onRequest: [app.authenticate] }, async (request) => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        avatar: true,
        currency: true,
        specialCurrency: true,
      },
    });
    return { user };
  });

  // Protected home endpoint (legacy — kept for compatibility)
  app.get("/api/home", { onRequest: [app.authenticate] }, async (request) => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { username: true },
    });

    return {
      message: `Welcome back, ${user?.username ?? "Explorer"}!`,
    };
  });
};