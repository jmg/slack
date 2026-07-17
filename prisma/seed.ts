import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const NOW = Date.now();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000);

async function main() {
  console.log("Clearing existing data…");
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  console.log("Creating users…");
  const passwordHash = await bcrypt.hash("password123", 10);
  const usersData = [
    { name: "Ada Lovelace", email: "ada@acme.test" },
    { name: "Alan Turing", email: "alan@acme.test" },
    { name: "Grace Hopper", email: "grace@acme.test" },
    { name: "Linus Torvalds", email: "linus@acme.test" },
  ];
  const users = await Promise.all(
    usersData.map((u) =>
      prisma.user.create({ data: { ...u, passwordHash } }),
    ),
  );
  const [ada, alan, grace, linus] = users;

  console.log("Creating workspace…");
  const workspace = await prisma.workspace.create({
    data: {
      name: "Acme Inc",
      slug: "acme-inc",
      ownerId: ada.id,
      members: {
        create: [
          { userId: ada.id, role: "ADMIN" },
          { userId: alan.id, role: "MEMBER" },
          { userId: grace.id, role: "MEMBER" },
          { userId: linus.id, role: "MEMBER" },
        ],
      },
    },
  });

  console.log("Creating channels…");
  async function createChannel(
    name: string,
    description: string,
    memberIds: string[],
    isPrivate = false,
  ) {
    return prisma.channel.create({
      data: {
        workspaceId: workspace.id,
        name,
        description,
        isPrivate,
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
    });
  }

  const allIds = users.map((u) => u.id);
  const general = await createChannel(
    "general",
    "Company-wide announcements and work-based matters.",
    allIds,
  );
  const random = await createChannel(
    "random",
    "Non-work banter and water-cooler conversation.",
    allIds,
  );
  const engineering = await createChannel(
    "engineering",
    "Ship it. Discussions about the codebase and deploys.",
    allIds,
  );
  await createChannel(
    "design",
    "Private space for the design crew.",
    [ada.id, grace.id],
    true,
  );

  console.log("Seeding messages…");
  async function say(
    channelId: string,
    userId: string,
    body: string,
    mAgo: number,
  ) {
    return prisma.message.create({
      data: { channelId, userId, body, createdAt: minutesAgo(mAgo) },
    });
  }

  await say(general.id, ada.id, "Welcome to Acme Inc 👋 Glad to have everyone here!", 180);
  await say(general.id, grace.id, "Thrilled to be here. Where do we track the roadmap?", 176);
  await say(general.id, ada.id, "In #engineering for now — we'll formalize it this week.", 174);
  await say(general.id, linus.id, "Morning all ☕", 60);

  await say(engineering.id, linus.id, "Pushed the new auth flow to staging. Please give it a spin.", 120);
  await say(engineering.id, alan.id, "Nice. The JWT sessions feel snappy.", 118);
  const reactMsg = await say(
    engineering.id,
    grace.id,
    "Tests are green ✅ Merging now.",
    115,
  );
  await say(engineering.id, ada.id, "🚀 Great work team.", 112);

  await say(random.id, grace.id, "Anyone up for lunch at noon?", 90);
  await say(random.id, alan.id, "Count me in.", 88);

  console.log("Adding reactions…");
  await prisma.reaction.createMany({
    data: [
      { messageId: reactMsg.id, userId: ada.id, emoji: "🎉" },
      { messageId: reactMsg.id, userId: alan.id, emoji: "🎉" },
      { messageId: reactMsg.id, userId: linus.id, emoji: "🔥" },
    ],
  });

  console.log("Creating a direct message conversation…");
  const conversation = await prisma.conversation.create({
    data: {
      workspaceId: workspace.id,
      members: { create: [{ userId: ada.id }, { userId: alan.id }] },
    },
  });
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      userId: alan.id,
      body: "Hey Ada, do you have five minutes to review my PR?",
      createdAt: minutesAgo(45),
    },
  });
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      userId: ada.id,
      body: "Sure — sending comments now.",
      createdAt: minutesAgo(43),
    },
  });

  console.log("\nSeed complete ✅");
  console.log("Log in with any of these accounts (password: password123):");
  for (const u of usersData) console.log(`  • ${u.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
