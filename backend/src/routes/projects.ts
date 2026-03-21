import { FastifyPluginAsync } from "fastify";

export const projectRoutes: FastifyPluginAsync = async (app) => {
  // Protected endpoint: requires valid authentication
  app.get("/", { onRequest: [app.authenticate] }, async () => {
    const projects = await app.prisma.project.findMany({
      orderBy: {
        updatedAt: "desc",
      },
    });

    return {
      items: projects.map((project) => ({
        id: project.id,
        name: project.name,
        fullName: project.fullName,
        description: project.description,
        language: project.language,
        updatedAt: project.updatedAt,
      })),
    };
  });
};
