import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { verifyAuthToken } from "../services/authToken.js";

/**
 * Authenticate middleware: Validates Bearer token and ensures user is logged in.
 * Rejects request with 401 if token is missing, invalid, or expired.
 */
export const createAuthenticateHook =
  (app: FastifyInstance) => async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      reply.status(401).send({ error: "Unauthorized: Missing or invalid authorization header" });
      return;
    }

    const token = authHeader.slice("Bearer ".length);
    const payload = verifyAuthToken(token, app.config.JWT_SECRET);
    if (!payload) {
      reply.status(401).send({ error: "Unauthorized: Invalid or expired token" });
      return;
    }

    request.user = payload;
  };

/**
 * Admin authorization middleware: Checks if authenticated user has admin role.
 * Must be used after authentication has been verified.
 * Rejects with 403 if user is not an admin.
 */
export const createAuthorizeAdminHook =
  (app: FastifyInstance) => async (request: FastifyRequest, reply: FastifyReply) => {
    // First ensure user is authenticated (should run after auth middleware)
    if (!request.user?.id) {
      reply.status(401).send({ error: "Unauthorized: User not authenticated" });
      return;
    }

    // Check if user has admin role
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.id },
    });

    if (!user || user.role !== "admin") {
      reply.status(403).send({ error: "Forbidden: Admin access required" });
      return;
    }
  };
