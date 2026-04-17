import { ForumReactionType, Prisma } from "@prisma/client";
import { FastifyPluginAsync } from "fastify";

type ListPostsQuery = {
  search?: string;
  categoryId?: string;
  sort?: "new" | "active" | "top";
  page?: string;
  pageSize?: string;
};

type CreatePostBody = {
  categoryId: string;
  title: string;
  content: string;
};

type UpdatePostBody = {
  categoryId?: string;
  title?: string;
  content?: string;
};

type CreateReplyBody = {
  content: string;
  parentReplyId?: string;
};

type SetReactionBody = {
  reaction: "like" | "dislike" | null;
};

type ForumPostWithRelations = Prisma.ForumPostGetPayload<{
  include: {
    user: { select: { id: true; username: true; avatar: true } };
    category: { select: { id: true; name: true } };
    reactions: { select: { userId: true; type: true } };
    _count: { select: { replies: true; views: true } };
  };
}>;

type ForumReplyWithUser = Prisma.ForumReplyGetPayload<{
  include: {
    user: { select: { id: true; username: true; avatar: true } };
  };
}>;

const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const clampPageSize = (value: string | undefined): number => {
  const parsed = parsePositiveInt(value, DEFAULT_PAGE_SIZE);
  return Math.min(parsed, MAX_PAGE_SIZE);
};

const summarizeReactions = (
  reactions: Array<{ userId: string; type: ForumReactionType }>,
  currentUserId: string,
): {
  likeCount: number;
  dislikeCount: number;
  viewerReaction: "like" | "dislike" | null;
} => {
  let likeCount = 0;
  let dislikeCount = 0;
  let viewerReaction: "like" | "dislike" | null = null;

  for (const reaction of reactions) {
    if (reaction.type === "like") {
      likeCount += 1;
    } else if (reaction.type === "dislike") {
      dislikeCount += 1;
    }

    if (reaction.userId === currentUserId) {
      viewerReaction = reaction.type;
    }
  }

  return { likeCount, dislikeCount, viewerReaction };
};

const serializePostSummary = (post: ForumPostWithRelations, currentUserId: string) => {
  const { likeCount, dislikeCount, viewerReaction } = summarizeReactions(post.reactions, currentUserId);

  return {
    id: post.id,
    title: post.title,
    content: post.content,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    category: post.category,
    author: post.user,
    isAuthor: post.userId === currentUserId,
    replyCount: post._count.replies,
    viewCount: post._count.views,
    likeCount,
    dislikeCount,
    viewerReaction,
  };
};

type ThreadReplyNode = {
  id: string;
  postId: string;
  parentReplyId: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  isAuthor: boolean;
  author: {
    id: string;
    username: string;
    avatar: string | null;
  };
  children: ThreadReplyNode[];
};

const buildReplyTree = (replies: ForumReplyWithUser[], currentUserId: string): ThreadReplyNode[] => {
  const nodes = new Map<string, ThreadReplyNode>();
  const roots: ThreadReplyNode[] = [];

  for (const reply of replies) {
    nodes.set(reply.id, {
      id: reply.id,
      postId: reply.postId,
      parentReplyId: reply.parentReplyId,
      content: reply.content,
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt,
      isAuthor: reply.userId === currentUserId,
      author: {
        id: reply.user.id,
        username: reply.user.username,
        avatar: reply.user.avatar,
      },
      children: [],
    });
  }

  for (const node of nodes.values()) {
    if (node.parentReplyId) {
      const parent = nodes.get(node.parentReplyId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }

    roots.push(node);
  }

  return roots;
};

const validateCategoryId = (categoryId: string | undefined): string | null => {
  const trimmed = categoryId?.trim();
  return trimmed ? trimmed : null;
};

export const forumRoutes: FastifyPluginAsync = async (app) => {
  app.get("/categories", { onRequest: [app.authenticate] }, async () => {
    const categories = await app.prisma.forumCategory.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            posts: true,
          },
        },
      },
    });

    return {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        postCount: category._count.posts,
      })),
    };
  });

  app.get<{ Querystring: ListPostsQuery }>("/posts", { onRequest: [app.authenticate] }, async (request) => {
    const search = request.query.search?.trim() ?? "";
    const categoryId = validateCategoryId(request.query.categoryId);
    const sort = request.query.sort ?? "new";
    const page = parsePositiveInt(request.query.page, 1);
    const pageSize = clampPageSize(request.query.pageSize);
    const skip = (page - 1) * pageSize;

    const where: Prisma.ForumPostWhereInput = {
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
          OR: [
            { title: { contains: search } },
            { content: { contains: search } },
          ],
        }
        : {}),
    };

    const orderBy: Prisma.ForumPostOrderByWithRelationInput[] =
      sort === "active"
        ? [{ replies: { _count: "desc" } }, { createdAt: "desc" }]
        : sort === "top"
          ? [{ views: { _count: "desc" } }, { createdAt: "desc" }]
          : [{ createdAt: "desc" }];

    const [total, posts] = await Promise.all([
      app.prisma.forumPost.count({ where }),
      app.prisma.forumPost.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          reactions: {
            select: {
              userId: true,
              type: true,
            },
          },
          _count: {
            select: {
              replies: true,
              views: true,
            },
          },
        },
      }),
    ]);

    return {
      posts: posts.map((post) => serializePostSummary(post, request.user.id)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  });

  app.get<{ Params: { postId: string } }>("/posts/:postId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const postId = request.params.postId?.trim();
    if (!postId) {
      return reply.status(400).send({ error: "Post id is required" });
    }

    const post = await app.prisma.forumPost.findUnique({
      where: { id: postId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        reactions: {
          select: {
            userId: true,
            type: true,
          },
        },
        _count: {
          select: {
            replies: true,
            views: true,
          },
        },
      },
    });

    if (!post) {
      return reply.status(404).send({ error: "Post not found" });
    }

    const replies = await app.prisma.forumReply.findMany({
      where: { postId },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    return {
      post: serializePostSummary(post, request.user.id),
      replies: buildReplyTree(replies, request.user.id),
    };
  });

  app.post<{ Body: CreatePostBody }>("/posts", { onRequest: [app.authenticate] }, async (request, reply) => {
    const title = request.body.title?.trim();
    const content = request.body.content?.trim();
    const categoryId = validateCategoryId(request.body.categoryId);

    if (!categoryId) {
      return reply.status(400).send({ error: "Category is required" });
    }

    if (!title || title.length < 3 || title.length > 180) {
      return reply.status(400).send({ error: "Title must be between 3 and 180 characters" });
    }

    if (!content || content.length < 1 || content.length > 10_000) {
      return reply.status(400).send({ error: "Content must be between 1 and 10000 characters" });
    }

    const category = await app.prisma.forumCategory.findUnique({ where: { id: categoryId } });
    if (!category) {
      return reply.status(404).send({ error: "Category not found" });
    }

    const post = await app.prisma.forumPost.create({
      data: {
        categoryId,
        userId: request.user.id,
        title,
        content,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        reactions: {
          select: {
            userId: true,
            type: true,
          },
        },
        _count: {
          select: {
            replies: true,
            views: true,
          },
        },
      },
    });

    return reply.status(201).send({ post: serializePostSummary(post, request.user.id) });
  });

  app.put<{ Params: { postId: string }; Body: UpdatePostBody }>(
    "/posts/:postId",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const postId = request.params.postId?.trim();
      if (!postId) {
        return reply.status(400).send({ error: "Post id is required" });
      }

      const existing = await app.prisma.forumPost.findUnique({ where: { id: postId } });
      if (!existing) {
        return reply.status(404).send({ error: "Post not found" });
      }

      if (existing.userId !== request.user.id) {
        return reply.status(403).send({ error: "You can only edit your own posts" });
      }

      const nextTitle = request.body.title?.trim();
      const nextContent = request.body.content?.trim();
      const nextCategoryId = validateCategoryId(request.body.categoryId);

      if (nextTitle !== undefined && (nextTitle.length < 3 || nextTitle.length > 180)) {
        return reply.status(400).send({ error: "Title must be between 3 and 180 characters" });
      }

      if (nextContent !== undefined && (nextContent.length < 1 || nextContent.length > 10_000)) {
        return reply.status(400).send({ error: "Content must be between 1 and 10000 characters" });
      }

      if (request.body.categoryId !== undefined && !nextCategoryId) {
        return reply.status(400).send({ error: "Category is required" });
      }

      if (!nextTitle && !nextContent && request.body.categoryId === undefined) {
        return reply.status(400).send({ error: "No update data provided" });
      }

      if (nextCategoryId) {
        const category = await app.prisma.forumCategory.findUnique({ where: { id: nextCategoryId } });
        if (!category) {
          return reply.status(404).send({ error: "Category not found" });
        }
      }

      const post = await app.prisma.forumPost.update({
        where: { id: postId },
        data: {
          ...(nextTitle !== undefined ? { title: nextTitle } : {}),
          ...(nextContent !== undefined ? { content: nextContent } : {}),
          ...(nextCategoryId ? { categoryId: nextCategoryId } : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          reactions: {
            select: {
              userId: true,
              type: true,
            },
          },
          _count: {
            select: {
              replies: true,
              views: true,
            },
          },
        },
      });

      return { post: serializePostSummary(post, request.user.id) };
    },
  );

  app.post<{ Params: { postId: string }; Body: CreateReplyBody }>(
    "/posts/:postId/replies",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const postId = request.params.postId?.trim();
      const content = request.body.content?.trim();
      const parentReplyId = request.body.parentReplyId?.trim() || null;

      if (!postId) {
        return reply.status(400).send({ error: "Post id is required" });
      }

      if (!content || content.length < 1 || content.length > 5_000) {
        return reply.status(400).send({ error: "Reply content must be between 1 and 5000 characters" });
      }

      const post = await app.prisma.forumPost.findUnique({ where: { id: postId }, select: { id: true } });
      if (!post) {
        return reply.status(404).send({ error: "Post not found" });
      }

      if (parentReplyId) {
        const parentReply = await app.prisma.forumReply.findFirst({
          where: {
            id: parentReplyId,
            postId,
          },
          select: { id: true },
        });

        if (!parentReply) {
          return reply.status(404).send({ error: "Parent reply not found" });
        }
      }

      const created = await app.prisma.forumReply.create({
        data: {
          postId,
          userId: request.user.id,
          parentReplyId,
          content,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
      });

      return reply.status(201).send({
        reply: {
          id: created.id,
          postId: created.postId,
          parentReplyId: created.parentReplyId,
          content: created.content,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          isAuthor: created.userId === request.user.id,
          author: {
            id: created.user.id,
            username: created.user.username,
            avatar: created.user.avatar,
          },
          children: [],
        },
      });
    },
  );

  app.post<{ Params: { postId: string }; Body: SetReactionBody }>(
    "/posts/:postId/reaction",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const postId = request.params.postId?.trim();
      if (!postId) {
        return reply.status(400).send({ error: "Post id is required" });
      }

      const reaction = request.body.reaction;
      if (reaction !== "like" && reaction !== "dislike" && reaction !== null) {
        return reply.status(400).send({ error: "Reaction must be like, dislike, or null" });
      }

      const post = await app.prisma.forumPost.findUnique({ where: { id: postId }, select: { id: true } });
      if (!post) {
        return reply.status(404).send({ error: "Post not found" });
      }

      if (reaction === null) {
        await app.prisma.forumPostReaction.deleteMany({
          where: {
            postId,
            userId: request.user.id,
          },
        });
      } else {
        await app.prisma.forumPostReaction.upsert({
          where: {
            postId_userId: {
              postId,
              userId: request.user.id,
            },
          },
          create: {
            postId,
            userId: request.user.id,
            type: reaction,
          },
          update: {
            type: reaction,
          },
        });
      }

      const reactions = await app.prisma.forumPostReaction.findMany({
        where: { postId },
        select: {
          userId: true,
          type: true,
        },
      });

      const { likeCount, dislikeCount, viewerReaction } = summarizeReactions(reactions, request.user.id);

      return {
        likeCount,
        dislikeCount,
        viewerReaction,
      };
    },
  );

  app.post<{ Params: { postId: string } }>(
    "/posts/:postId/views",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const postId = request.params.postId?.trim();
      if (!postId) {
        return reply.status(400).send({ error: "Post id is required" });
      }

      const post = await app.prisma.forumPost.findUnique({ where: { id: postId }, select: { id: true } });
      if (!post) {
        return reply.status(404).send({ error: "Post not found" });
      }

      await app.prisma.forumPostView.upsert({
        where: {
          postId_userId: {
            postId,
            userId: request.user.id,
          },
        },
        create: {
          postId,
          userId: request.user.id,
        },
        update: {
          updatedAt: new Date(),
        },
      });

      const viewCount = await app.prisma.forumPostView.count({ where: { postId } });
      return { viewCount };
    },
  );
};
