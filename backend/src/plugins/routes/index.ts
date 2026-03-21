import { FastifyPluginAsync } from "fastify";
import { healthRoutes } from "../../routes/health.js";
import { projectRoutes } from "../../routes/projects.js";
import { registerAuthRoutes } from "../../routes/auth.js";
import { bannerRoutes } from "../../routes/banner.js";
import { homeDataRoutes } from "../../routes/home.js";
import { profileRoutes } from "../../routes/profile.js";
import { lootboxRoutes } from "../../routes/lootbox.js";
import { marketRoutes } from "../../routes/market.js";

export const registerRoutes: FastifyPluginAsync = async (app) => {
  await app.register(healthRoutes);
  await app.register(projectRoutes, { prefix: "/projects" });
  await registerAuthRoutes(app);
  await app.register(bannerRoutes, { prefix: "/api/banners" });
  await app.register(homeDataRoutes, { prefix: "/api/home" });
  await app.register(profileRoutes, { prefix: "/api/profile" });
  await app.register(lootboxRoutes, { prefix: "/api/lootbox" });
  await app.register(marketRoutes, { prefix: "/api/market" });
};
