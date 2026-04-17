import "dotenv/config";
import { ForumReactionType, PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { importCs2Catalog } from "./cs2Import.js";
const prisma = new PrismaClient();

const hashPassword = async (password: string) => {
  return bcrypt.hash(password, 10);
};

const randomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const pickRandom = <T>(items: T[]): T => {
  return items[randomInt(0, items.length - 1)];
};

const pickWeighted = <T extends { weight: number }>(items: T[]): T => {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * totalWeight;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item;
    }
  }

  return items[items.length - 1];
};

const main = async () => {
  // ── Users ────────────────────────────────────────────────────────────────
  await prisma.user.deleteMany();

  const [hp1, hp2, hp3] = await Promise.all([
    hashPassword("pass123"),
    hashPassword("admin123"),
    hashPassword("user123"),
  ]);

  const USER_ROLES: UserRole[] = [UserRole.user, UserRole.vip, UserRole.superVip];

  const user1 = await prisma.user.create({
    data: {
      username: "user1",
      email: "user1@example.com",
      passwordHash: hp1,
      role: pickRandom(USER_ROLES),
      currency: 1800,
      specialCurrency: 120,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      username: "admin",
      email: "admin@example.com",
      passwordHash: hp2,
      role: UserRole.admin,
      currency: 9999,
      specialCurrency: 999,
    },
  });

  const user3 = await prisma.user.create({
    data: {
      username: "user2",
      email: "user2@example.com",
      passwordHash: hp3,
      role: pickRandom(USER_ROLES),
      currency: 1400,
      specialCurrency: 90,
    },
  });

  const fakeUsers = [] as Array<{ id: string; username: string }>;
  const fakePasswordHash = await hashPassword("sim123");
  const fakeUserCount = randomInt(16, 24);

  for (let i = 1; i <= fakeUserCount; i += 1) {
    const fakeUser = await prisma.user.create({
      data: {
        username: `sim_user_${i}`,
        email: `sim_user_${i}@example.com`,
        passwordHash: fakePasswordHash,
        role: pickRandom(USER_ROLES),
        currency: randomInt(300, 3200),
      },
      select: {
        id: true,
        username: true,
      },
    });

    fakeUsers.push(fakeUser);
  }

  console.log("Seeded users:", user1.username, user2.username, user3.username, `+ ${fakeUsers.length} simulated`);

  // ── Project (existing seed data) ─────────────────────────────────────────
  const project = await prisma.project.upsert({
    where: { id: "seed-project-1" },
    update: {},
    create: {
      id: "seed-project-1",
      name: "portfolio-starter",
      fullName: "local/portfolio-starter",
      description: "Local seeded project.",
      language: "TypeScript",
    },
    select: { id: true },
  });

  const technology = await prisma.technology.upsert({
    where: { name: "TypeScript" },
    update: {},
    create: { name: "TypeScript" },
    select: { id: true },
  });

  await prisma.projectTech.upsert({
    where: {
      projectId_technologyId: {
        projectId: project.id,
        technologyId: technology.id,
      },
    },
    update: {},
    create: { projectId: project.id, technologyId: technology.id },
  });

  await prisma.lootboxFavorite.deleteMany();
  await prisma.lootboxRoll.deleteMany();
  await prisma.lootboxItem.deleteMany();
  await prisma.lootbox.deleteMany();
  await prisma.item.deleteMany();

  const catalog = await importCs2Catalog(prisma);
  console.log("Imported CS2 catalog:", catalog.stats);

  if (catalog.importedItems.length === 0 || catalog.casePools.length === 0) {
    throw new Error("CS2 catalog import did not produce usable items and cases.");
  }

  const legendaryItems = catalog.importedItems.filter((item) => item.rarity === "Legendary");
  const highlightedItems = (legendaryItems.length > 0 ? legendaryItems : catalog.importedItems).slice(0, 4);
  const featuredPool = catalog.casePools[0];

  // ── Recent Legendary Rolls (for the Home page panel) ─────────────────────
  const rollData = [
    { userId: user1.id, itemId: highlightedItems[0]?.id ?? catalog.importedItems[0].id },
    { userId: user3.id, itemId: highlightedItems[1]?.id ?? catalog.importedItems[1].id },
    { userId: user2.id, itemId: highlightedItems[2]?.id ?? catalog.importedItems[2].id },
    { userId: user1.id, itemId: highlightedItems[3]?.id ?? catalog.importedItems[3].id },
  ];

  await prisma.lootboxRoll.deleteMany();
  for (const roll of rollData) {
    await prisma.lootboxRoll.create({
      data: {
        userId: roll.userId,
        lootboxId: featuredPool.lootboxId,
        resultItemId: roll.itemId,
        costPaid: featuredPool.cost,
      },
    });
  }

  const allUsers = [
    { id: user1.id, username: user1.username },
    { id: user2.id, username: user2.username },
    { id: user3.id, username: user3.username },
    ...fakeUsers,
  ];

  const simulatedCasePools = catalog.casePools;

  const simulatedRollCount = randomInt(170, 260);
  for (let i = 0; i < simulatedRollCount; i += 1) {
    const casePool = pickRandom(simulatedCasePools);
    const pickedEntry = pickWeighted(casePool.entries);
    const pickedUser = pickRandom(allUsers);

    await prisma.lootboxRoll.create({
      data: {
        userId: pickedUser.id,
        lootboxId: casePool.lootboxId,
        resultItemId: pickedEntry.itemId,
        costPaid: casePool.cost,
      },
    });
  }

  console.log("Seeded lootboxes + simulated case openings");

  // ── Forum Seed Data ───────────────────────────────────────────────────────
  await prisma.forumPostView.deleteMany();
  await prisma.forumPostReaction.deleteMany();
  await prisma.forumReply.deleteMany();
  await prisma.forumPost.deleteMany();
  await prisma.forumCategory.deleteMany();
  await prisma.marketListing.deleteMany();

  const catGeneral = await prisma.forumCategory.create({
    data: { name: "General", description: "General discussion" },
  });
  const catTrades = await prisma.forumCategory.create({
    data: { name: "Trades", description: "Trade offers and negotiations" },
  });

  const post1 = await prisma.forumPost.create({
    data: {
      userId: user1.id,
      categoryId: catGeneral.id,
      title: "Welcome to the Hub!",
      content: "First post here — excited to see what drops people are getting.",
    },
  });
  const post2 = await prisma.forumPost.create({
    data: {
      userId: user2.id,
      categoryId: catGeneral.id,
      title: "Patch Notes: New Lootboxes Coming",
      content: "We're adding new seasonal crates next week. Stay tuned for announcements.",
    },
  });
  const post3 = await prisma.forumPost.create({
    data: {
      userId: user3.id,
      categoryId: catTrades.id,
      title: "WTT: Dragon Blade for Void Ripper",
      content: "Have a Dragon Blade factory-new, looking for a Void Ripper. Hit me up.",
    },
  });

  const baseReply1 = await prisma.forumReply.create({
    data: {
      postId: post1.id,
      userId: user2.id,
      content: "Welcome! Great place to start.",
    },
  });
  await prisma.forumReply.create({
    data: {
      postId: post1.id,
      userId: user3.id,
      parentReplyId: baseReply1.id,
      content: "Same here, this forum is shaping up nicely.",
    },
  });

  await prisma.forumReply.createMany({
    data: [
      { postId: post1.id, userId: user3.id, content: "Been eyeing those legendary crates too." },
      { postId: post2.id, userId: user1.id, content: "Hyped for the seasonal crates!" },
      { postId: post2.id, userId: user3.id, content: "Any hint on the rarity rates?" },
      { postId: post2.id, userId: user1.id, content: "Will the current crates be retired?" },
      { postId: post3.id, userId: user2.id, content: "Fair trade, good luck finding a match." },
    ],
  });

  const forumTemplates = [
    {
      title: "Anyone else farming Neon Foundry?",
      content: "Drop rates feel spicy tonight. Got two epics in 8 opens.",
      categoryId: catGeneral.id,
    },
    {
      title: "Price check on Carbon Mesh",
      content: "Seeing wide spread in listings. What are you valuing this at right now?",
      categoryId: catTrades.id,
    },
    {
      title: "Relic case discussion thread",
      content: "Post your best pulls from Ancient Relic in here.",
      categoryId: catGeneral.id,
    },
  ];

  const simulatedPosts = [] as Array<{ id: string; userId: string }>;
  const extraPostCount = randomInt(10, 20);
  for (let i = 0; i < extraPostCount; i += 1) {
    const template = pickRandom(forumTemplates);
    const author = pickRandom(fakeUsers);
    const post = await prisma.forumPost.create({
      data: {
        userId: author.id,
        categoryId: template.categoryId,
        title: `${template.title} #${i + 1}`,
        content: template.content,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    simulatedPosts.push(post);
  }

  for (const post of simulatedPosts) {
    const replyCount = randomInt(1, 4);
    const replyData = Array.from({ length: replyCount }).map(() => {
      const replier = pickRandom(fakeUsers);
      return {
        postId: post.id,
        userId: replier.id,
        content: pickRandom([
          "Nice pull, congrats.",
          "I am seeing similar results on my side.",
          "Market should move after this batch of openings.",
          "Thanks for posting the rates.",
        ]),
      };
    });

    const createdReplies = [] as Array<{ id: string }>;
    for (const data of replyData) {
      const created = await prisma.forumReply.create({ data });
      createdReplies.push({ id: created.id });
    }

    if (createdReplies.length >= 2 && Math.random() > 0.4) {
      await prisma.forumReply.create({
        data: {
          postId: post.id,
          userId: pickRandom(fakeUsers).id,
          parentReplyId: createdReplies[0].id,
          content: pickRandom([
            "Replying here to add more context.",
            "Nested thread makes this easier to follow.",
            "Agree with this point and adding one more thought.",
          ]),
        },
      });
    }

    const viewers = [post.userId, ...fakeUsers.map((user) => user.id)].filter(
      (value, index, all) => all.indexOf(value) === index,
    );

    const sampledViewers = viewers.slice(0, randomInt(2, Math.min(8, viewers.length)));
    for (const viewerId of sampledViewers) {
      await prisma.forumPostView.upsert({
        where: {
          postId_userId: {
            postId: post.id,
            userId: viewerId,
          },
        },
        create: {
          postId: post.id,
          userId: viewerId,
        },
        update: {
          updatedAt: new Date(),
        },
      });
    }

    const sampledReactions = sampledViewers.slice(0, randomInt(1, Math.min(5, sampledViewers.length)));
    for (const userId of sampledReactions) {
      await prisma.forumPostReaction.upsert({
        where: {
          postId_userId: {
            postId: post.id,
            userId,
          },
        },
        create: {
          postId: post.id,
          userId,
          type: Math.random() > 0.25 ? ForumReactionType.like : ForumReactionType.dislike,
        },
        update: {
          type: Math.random() > 0.25 ? ForumReactionType.like : ForumReactionType.dislike,
        },
      });
    }
  }

  const baseViews = [
    { postId: post1.id, userId: user1.id },
    { postId: post1.id, userId: user2.id },
    { postId: post1.id, userId: user3.id },
    { postId: post2.id, userId: user1.id },
    { postId: post2.id, userId: user2.id },
    { postId: post3.id, userId: user2.id },
    { postId: post3.id, userId: user3.id },
  ];

  for (const baseView of baseViews) {
    await prisma.forumPostView.upsert({
      where: {
        postId_userId: {
          postId: baseView.postId,
          userId: baseView.userId,
        },
      },
      create: baseView,
      update: {
        updatedAt: new Date(),
      },
    });
  }

  const baseReactions = [
    { postId: post1.id, userId: user2.id, type: ForumReactionType.like },
    { postId: post1.id, userId: user3.id, type: ForumReactionType.like },
    { postId: post2.id, userId: user1.id, type: ForumReactionType.like },
    { postId: post2.id, userId: user3.id, type: ForumReactionType.dislike },
    { postId: post3.id, userId: user1.id, type: ForumReactionType.like },
  ];

  for (const baseReaction of baseReactions) {
    await prisma.forumPostReaction.upsert({
      where: {
        postId_userId: {
          postId: baseReaction.postId,
          userId: baseReaction.userId,
        },
      },
      create: baseReaction,
      update: {
        type: baseReaction.type,
      },
    });
  }

  const tradableItems = catalog.importedItems.slice(0, 600);

  const listingCount = 50;
  for (let i = 0; i < listingCount; i += 1) {
    const seller = pickRandom(allUsers);
    const item = pickRandom(tradableItems);
    const listedQuantity = randomInt(1, 6);
    const baseValue = Number(item.realWorldValue);
    const randomizedMultiplier = randomInt(70, 250) / 100;
    const listedPriceCents = Math.max(100, Math.round(baseValue * randomizedMultiplier * 100));

    await prisma.userItem.upsert({
      where: {
        userId_itemId: {
          userId: seller.id,
          itemId: item.id,
        },
      },
      update: {
        quantity: {
          increment: listedQuantity + randomInt(0, 4),
        },
        reservedForMarket: {
          increment: listedQuantity,
        },
      },
      create: {
        userId: seller.id,
        itemId: item.id,
        quantity: listedQuantity + randomInt(0, 4),
        reservedForMarket: listedQuantity,
      },
    });

    await prisma.marketListing.create({
      data: {
        userId: seller.id,
        itemId: item.id,
        quantity: listedQuantity,
        pricePerUnit: listedPriceCents,
        isActive: true,
      },
    });
  }

  console.log("Seeded forum posts, replies, and simulated market listings");

  // ── Banners ────────────────────────────────────────────────────────────────
  await prisma.banner.deleteMany();

  await prisma.banner.createMany({
    data: [
      {
        title: "Daily Market Movers",
        subtitle: "Track hot listings and price swings before everyone else",
        imageUrl: "https://placehold.co/1200x400/0f1724/2dd4bf?text=Market+Movers+%E2%80%94+Daily+Highlights",
        linkPath: "/market",
        linkLabel: "View Listings",
        displayOrder: 0,
        isActive: true,
      },
      {
        title: "Community Strategy Threads",
        subtitle: "Read build guides, trade tips, and weekly discussion picks",
        imageUrl: "https://placehold.co/1200x400/1b1033/f59e0b?text=Forum+%E2%80%94+Top+Threads",
        linkPath: "/forum",
        linkLabel: "Join Discussion",
        displayOrder: 1,
        isActive: true,
      },
      {
        title: "This Week's Featured Drops",
        subtitle: "Open curated lootboxes with standout rarity pools",
        imageUrl: "https://placehold.co/1200x400/0b1f35/60a5fa?text=Featured+Drops+%E2%80%94+This+Week",
        linkPath: "/lootbox",
        linkLabel: "Open Lootboxes",
        displayOrder: 2,
        isActive: true,
      },
      {
        title: "Inventory Snapshot",
        subtitle: "Review your latest pulls and portfolio value at a glance",
        imageUrl: "https://placehold.co/1200x400/1d0f1a/f472b6?text=Profile+%E2%80%94+Inventory+Snapshot",
        linkPath: "/profile",
        linkLabel: "Open Profile",
        displayOrder: 3,
        isActive: true,
      },
    ],
  });

  console.log("Seeded 4 banners");
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });