import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
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

  const user1 = await prisma.user.create({
    data: {
      username: "user1",
      email: "user1@example.com",
      passwordHash: hp1,
      role: "user",
      currency: 1800,
      specialCurrency: 120,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      username: "admin",
      email: "admin@example.com",
      passwordHash: hp2,
      role: "admin",
      currency: 9999,
      specialCurrency: 999,
    },
  });

  const user3 = await prisma.user.create({
    data: {
      username: "user2",
      email: "user2@example.com",
      passwordHash: hp3,
      role: "user",
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
        role: "user",
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

  // ── Items (for lootbox rolls) ─────────────────────────────────────────────
  const itemDragon = await prisma.item.upsert({
    where: { id: "seed-item-dragon" },
    update: {},
    create: {
      id: "seed-item-dragon",
      name: "Dragon Slayer Blade",
      image: "https://placehold.co/400x400/1a1a2e/e94560?text=Dragon+Blade",
      description: "A legendary blade forged in dragonfire.",
      rarity: "Legendary",
      realWorldValue: 120.0,
      weaponType: "Sword",
      wearMin: 0.0,
      wearMax: 0.2,
    },
  });

  const itemVoid = await prisma.item.upsert({
    where: { id: "seed-item-void" },
    update: {},
    create: {
      id: "seed-item-void",
      name: "Void Ripper",
      image: "https://placehold.co/400x400/0d0d1a/9d4edd?text=Void+Ripper",
      description: "Tears through reality itself.",
      rarity: "Legendary",
      realWorldValue: 95.0,
      weaponType: "Dagger",
      wearMin: 0.0,
      wearMax: 0.15,
    },
  });

  const itemStorm = await prisma.item.upsert({
    where: { id: "seed-item-storm" },
    update: {},
    create: {
      id: "seed-item-storm",
      name: "Stormcaller Staff",
      image: "https://placehold.co/400x400/0a1628/00b4d8?text=Stormcaller",
      description: "Commands the fury of the storm.",
      rarity: "Legendary",
      realWorldValue: 150.0,
      weaponType: "Staff",
      wearMin: 0.0,
      wearMax: 0.1,
    },
  });

  const itemShadow = await prisma.item.upsert({
    where: { id: "seed-item-shadow" },
    update: {},
    create: {
      id: "seed-item-shadow",
      name: "Shadow Crown",
      image: "https://placehold.co/400x400/111111/ffd700?text=Shadow+Crown",
      description: "Worn only by kings of the underworld.",
      rarity: "Legendary",
      realWorldValue: 200.0,
    },
  });

  const itemNeonVector = await prisma.item.upsert({
    where: { id: "seed-item-neon-vector" },
    update: {},
    create: {
      id: "seed-item-neon-vector",
      name: "Neon Vector SMG",
      image: "https://placehold.co/400x400/071d2c/2dc8ff?text=Neon+Vector",
      description: "A fast-firing SMG with electric trim lines.",
      rarity: "Epic",
      realWorldValue: 55.0,
      weaponType: "SMG",
      wearMin: 0.03,
      wearMax: 0.35,
    },
  });

  const itemRoyalHowl = await prisma.item.upsert({
    where: { id: "seed-item-royal-howl" },
    update: {},
    create: {
      id: "seed-item-royal-howl",
      name: "Royal Howl Rifle",
      image: "https://placehold.co/400x400/2c1120/f97316?text=Royal+Howl",
      description: "A premium rifle skin from the royal collection.",
      rarity: "Epic",
      realWorldValue: 72.0,
      weaponType: "Rifle",
      wearMin: 0.04,
      wearMax: 0.42,
    },
  });

  const itemUrbanPulse = await prisma.item.upsert({
    where: { id: "seed-item-urban-pulse" },
    update: {},
    create: {
      id: "seed-item-urban-pulse",
      name: "Urban Pulse Pistol",
      image: "https://placehold.co/400x400/1f2937/93c5fd?text=Urban+Pulse",
      description: "Reliable sidearm with a clean urban pattern.",
      rarity: "Rare",
      realWorldValue: 26.0,
      weaponType: "Pistol",
      wearMin: 0.08,
      wearMax: 0.52,
    },
  });

  const itemCopperCoil = await prisma.item.upsert({
    where: { id: "seed-item-copper-coil" },
    update: {},
    create: {
      id: "seed-item-copper-coil",
      name: "Copper Coil Shotgun",
      image: "https://placehold.co/400x400/3b2f2f/f59e0b?text=Copper+Coil",
      description: "Heavy hitter with a rugged copper finish.",
      rarity: "Rare",
      realWorldValue: 31.0,
      weaponType: "Shotgun",
      wearMin: 0.09,
      wearMax: 0.58,
    },
  });

  const itemCarbonMesh = await prisma.item.upsert({
    where: { id: "seed-item-carbon-mesh" },
    update: {},
    create: {
      id: "seed-item-carbon-mesh",
      name: "Carbon Mesh Knife",
      image: "https://placehold.co/400x400/111827/a3e635?text=Carbon+Mesh",
      description: "Entry-grade tactical blade for daily runs.",
      rarity: "Common",
      realWorldValue: 14.0,
      weaponType: "Knife",
      wearMin: 0.16,
      wearMax: 0.74,
    },
  });

  const itemSignalFlare = await prisma.item.upsert({
    where: { id: "seed-item-signal-flare" },
    update: {},
    create: {
      id: "seed-item-signal-flare",
      name: "Signal Flare Charm",
      image: "https://placehold.co/400x400/172554/60a5fa?text=Signal+Flare",
      description: "A common charm from the foundry set.",
      rarity: "Common",
      realWorldValue: 9.0,
    },
  });

  console.log("Seeded items");

  // ── Lootboxes ─────────────────────────────────────────────────────────────
  const genesisLootbox = await prisma.lootbox.upsert({
    where: { id: "seed-lootbox-1" },
    update: {
      spendCurrency: "currency",
      cost: 500,
      isActive: true,
    },
    create: {
      id: "seed-lootbox-1",
      name: "Genesis Crate",
      image: "https://placehold.co/400x400/141c29/4588d0?text=Genesis+Crate",
      description: "The original crate. Contains rare and legendary items.",
      cost: 500,
      spendCurrency: "currency",
      isActive: true,
    },
  });

  const foundryLootbox = await prisma.lootbox.upsert({
    where: { id: "seed-lootbox-2" },
    update: {
      spendCurrency: "currency",
      cost: 320,
      isActive: true,
    },
    create: {
      id: "seed-lootbox-2",
      name: "Neon Foundry Case",
      image: "https://placehold.co/400x400/10243d/2dd4bf?text=Neon+Foundry",
      description: "Factory-fresh lineup packed with bright high-voltage finishes.",
      cost: 320,
      spendCurrency: "currency",
      isActive: true,
    },
  });

  const relicLootbox = await prisma.lootbox.upsert({
    where: { id: "seed-lootbox-3" },
    update: {
      spendCurrency: "specialCurrency",
      cost: 75,
      isActive: true,
    },
    create: {
      id: "seed-lootbox-3",
      name: "Ancient Relic Case",
      image: "https://placehold.co/400x400/2b1d0e/facc15?text=Ancient+Relic",
      description: "Dusty case rumored to hide old-world elite collectibles.",
      cost: 75,
      spendCurrency: "specialCurrency",
      isActive: true,
    },
  });

  const genesisPool = [
    [itemDragon.id, 5],
    [itemVoid.id, 5],
    [itemStorm.id, 3],
    [itemShadow.id, 2],
    [itemRoyalHowl.id, 8],
    [itemUrbanPulse.id, 12],
  ] as [string, number][];

  const foundryPool = [
    [itemNeonVector.id, "Epic", 8],
    [itemRoyalHowl.id, "Epic", 5],
    [itemUrbanPulse.id, "Rare", 13],
    [itemCopperCoil.id, "Rare", 11],
    [itemSignalFlare.id, "Common", 16],
    [itemCarbonMesh.id, "Common", 14],
  ] as [string, string, number][];

  const relicPool = [
    [itemShadow.id, "Legendary", 2],
    [itemDragon.id, "Legendary", 2],
    [itemStorm.id, "Legendary", 1],
    [itemRoyalHowl.id, "Epic", 7],
    [itemNeonVector.id, "Epic", 7],
    [itemCopperCoil.id, "Rare", 9],
    [itemCarbonMesh.id, "Common", 12],
  ] as [string, string, number][];

  // Genesis pool
  for (const [itemId, weight] of genesisPool) {
    await prisma.lootboxItem.upsert({
      where: { id: `seed-lbitem-genesis-${itemId}` },
      update: {},
      create: {
        id: `seed-lbitem-genesis-${itemId}`,
        lootboxId: genesisLootbox.id,
        itemId,
        rarity:
          itemId === itemDragon.id || itemId === itemVoid.id || itemId === itemStorm.id || itemId === itemShadow.id
            ? "Legendary"
            : itemId === itemRoyalHowl.id
              ? "Epic"
              : "Rare",
        weight,
        quantity: 1,
      },
    });
  }

  // Neon Foundry pool
  for (const [itemId, rarity, weight] of foundryPool) {
    await prisma.lootboxItem.upsert({
      where: { id: `seed-lbitem-foundry-${itemId}` },
      update: {},
      create: {
        id: `seed-lbitem-foundry-${itemId}`,
        lootboxId: foundryLootbox.id,
        itemId,
        rarity,
        weight,
        quantity: 1,
      },
    });
  }

  // Ancient Relic pool
  for (const [itemId, rarity, weight] of relicPool) {
    await prisma.lootboxItem.upsert({
      where: { id: `seed-lbitem-relic-${itemId}` },
      update: {},
      create: {
        id: `seed-lbitem-relic-${itemId}`,
        lootboxId: relicLootbox.id,
        itemId,
        rarity,
        weight,
        quantity: 1,
      },
    });
  }

  // ── Recent Legendary Rolls (for the Home page panel) ─────────────────────
  const rollData = [
    { userId: user1.id, itemId: itemDragon.id },
    { userId: user3.id, itemId: itemVoid.id },
    { userId: user2.id, itemId: itemStorm.id },
    { userId: user1.id, itemId: itemShadow.id },
  ];

  await prisma.lootboxRoll.deleteMany();
  for (const roll of rollData) {
    await prisma.lootboxRoll.create({
      data: {
        userId: roll.userId,
        lootboxId: genesisLootbox.id,
        resultItemId: roll.itemId,
        costPaid: genesisLootbox.cost,
      },
    });
  }

  const allUsers = [
    { id: user1.id, username: user1.username },
    { id: user2.id, username: user2.username },
    { id: user3.id, username: user3.username },
    ...fakeUsers,
  ];

  const simulatedCasePools = [
    {
      lootboxId: genesisLootbox.id,
      cost: genesisLootbox.cost,
      entries: genesisPool.map(([itemId, weight]) => ({ itemId, weight })),
    },
    {
      lootboxId: foundryLootbox.id,
      cost: foundryLootbox.cost,
      entries: foundryPool.map(([itemId, _rarity, weight]) => ({ itemId, weight })),
    },
    {
      lootboxId: relicLootbox.id,
      cost: relicLootbox.cost,
      entries: relicPool.map(([itemId, _rarity, weight]) => ({ itemId, weight })),
    },
  ];

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

  // Add some replies so the trending algo has data
  await prisma.forumReply.createMany({
    data: [
      { postId: post1.id, userId: user2.id, content: "Welcome! Great place to start." },
      { postId: post1.id, userId: user3.id, content: "Same, been eyeing those legendary crates." },
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

    await prisma.forumReply.createMany({ data: replyData });
  }

  const tradableItems = [
    itemDragon,
    itemVoid,
    itemStorm,
    itemShadow,
    itemNeonVector,
    itemRoyalHowl,
    itemUrbanPulse,
    itemCopperCoil,
    itemCarbonMesh,
    itemSignalFlare,
  ];

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
        title: "Genesis Crate is Live",
        subtitle: "Open your first crate and discover Legendary items",
        imageUrl: "https://placehold.co/1200x400/141c29/4588d0?text=Genesis+Crate+%E2%80%94+Now+Live",
        linkPath: "/lootbox",
        linkLabel: "Open Now",
        displayOrder: 0,
        isActive: true,
      },
      {
        title: "New Items on the Market",
        subtitle: "Browse today's freshest listings from community traders",
        imageUrl: "https://placehold.co/1200x400/0a1628/2dc8ff?text=Market+%E2%80%94+Fresh+Listings",
        linkPath: "/market",
        linkLabel: "Browse Market",
        displayOrder: 1,
        isActive: true,
      },
      {
        title: "Have Something to Trade?",
        subtitle: "Post an offer and connect with other traders",
        imageUrl: "https://placehold.co/1200x400/1a2435/e94560?text=Trade+%E2%80%94+Post+Your+Offer",
        linkPath: "/trade",
        linkLabel: "Start Trading",
        displayOrder: 2,
        isActive: true,
      },
    ],
  });

  console.log("Seeded 3 banners");
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