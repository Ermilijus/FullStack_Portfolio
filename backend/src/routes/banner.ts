import { FastifyPluginAsync } from "fastify";

// Valid app routes that can be used as banner link targets
const VALID_LINK_PATHS = ["/home", "/forum", "/lootbox", "/market", "/profile"];

type BannerBody = {
  title: string;
  subtitle?: string;
  imageUrl: string;
  linkPath: string;
  linkLabel?: string;
  displayOrder?: number;
  isActive?: boolean;
};

export const bannerRoutes: FastifyPluginAsync = async (app) => {
  // ── Public-ish: authenticated users fetch active banners ─────────────────
  app.get("/", { onRequest: [app.authenticate] }, async () => {
    const banners = await app.prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
    });
    return { banners };
  });

  // ── Admin: list ALL banners (including inactive) ─────────────────────────
  app.get(
    "/admin",
    { onRequest: [app.authenticate, app.authorizeAdmin] },
    async () => {
      const banners = await app.prisma.banner.findMany({
        orderBy: { displayOrder: "asc" },
      });
      return { banners };
    },
  );

  // ── Admin: create banner ─────────────────────────────────────────────────
  app.post<{ Body: BannerBody }>(
    "/admin",
    { onRequest: [app.authenticate, app.authorizeAdmin] },
    async (request, reply) => {
      const { title, subtitle, imageUrl, linkPath, linkLabel, displayOrder, isActive } =
        request.body;

      if (!title?.trim() || !imageUrl?.trim() || !linkPath?.trim()) {
        return reply.status(400).send({ error: "title, imageUrl, and linkPath are required" });
      }
      if (!VALID_LINK_PATHS.includes(linkPath)) {
        return reply
          .status(400)
          .send({ error: `linkPath must be one of: ${VALID_LINK_PATHS.join(", ")}` });
      }

      const banner = await app.prisma.banner.create({
        data: {
          title: title.trim(),
          subtitle: subtitle?.trim() ?? null,
          imageUrl: imageUrl.trim(),
          linkPath,
          linkLabel: linkLabel?.trim() ?? null,
          displayOrder: displayOrder ?? 0,
          isActive: isActive ?? true,
        },
      });

      return reply.status(201).send({ banner });
    },
  );

  // ── Admin: update banner ─────────────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: Partial<BannerBody> }>(
    "/admin/:id",
    { onRequest: [app.authenticate, app.authorizeAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const { title, subtitle, imageUrl, linkPath, linkLabel, displayOrder, isActive } =
        request.body;

      if (linkPath !== undefined && !VALID_LINK_PATHS.includes(linkPath)) {
        return reply
          .status(400)
          .send({ error: `linkPath must be one of: ${VALID_LINK_PATHS.join(", ")}` });
      }

      const existing = await app.prisma.banner.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: "Banner not found" });
      }

      const banner = await app.prisma.banner.update({
        where: { id },
        data: {
          ...(title !== undefined && { title: title.trim() }),
          ...(subtitle !== undefined && { subtitle: subtitle?.trim() ?? null }),
          ...(imageUrl !== undefined && { imageUrl: imageUrl.trim() }),
          ...(linkPath !== undefined && { linkPath }),
          ...(linkLabel !== undefined && { linkLabel: linkLabel?.trim() ?? null }),
          ...(displayOrder !== undefined && { displayOrder }),
          ...(isActive !== undefined && { isActive }),
        },
      });

      return { banner };
    },
  );

  // ── Admin: delete banner ─────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/admin/:id",
    { onRequest: [app.authenticate, app.authorizeAdmin] },
    async (request, reply) => {
      const { id } = request.params;

      const existing = await app.prisma.banner.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: "Banner not found" });
      }

      await app.prisma.banner.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
};
