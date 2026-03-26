import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadEnv } from "./plugins/env.js";
import { registerPrisma } from "./plugins/prisma.js";
import { registerRoutes } from "./plugins/routes/index.js";
import { createAuthenticateHook, createAuthorizeAdminHook } from "./middleware/auth.js";

export const buildApp = async () => {
  const config = loadEnv();
  const app = Fastify({ logger: true });
  const allowedOrigins = config.FRONTEND_ORIGIN
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const isLocalDevOrigin = (origin: string) => {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    } catch {
      return false;
    }
  };

  app.decorate("config", config);

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin) || isLocalDevOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
  });
  await app.register(registerPrisma);

  // Register middleware hooks after Prisma is available
  app.decorate("authenticate", createAuthenticateHook(app));
  app.decorate("authorizeAdmin", createAuthorizeAdminHook(app));

  await app.register(registerRoutes);

  return app;
};
