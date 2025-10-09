import bcrypt from "bcrypt";
import prisma from "../prisma";

// Seed dataset used for local/demo with username + interestTags (matches schema)
const FAKE_USERS = [
  {
    username: "alice",
    email: "alice@example.com",
    password: "password123",
    name: "Alice Johnson",
    interestTags: ["Coffee", "Dogs", "Hiking"],
  },
  {
    username: "ben",
    email: "ben@example.com",
    password: "password123",
    name: "Ben Carter",
    interestTags: ["Board Games", "Tech", "Running"],
  },
  {
    username: "carla",
    email: "carla@example.com",
    password: "password123",
    name: "Carla Singh",
    interestTags: ["Yoga", "Live Music", "Art"],
  },
  {
    username: "diego",
    email: "diego@example.com",
    password: "password123",
    name: "Diego Martinez",
    interestTags: ["Soccer", "Cooking", "Photography"],
  },
  {
    username: "emily",
    email: "emily@example.com",
    password: "password123",
    name: "Emily Chen",
    interestTags: ["Coffee", "Books", "Travel"],
  },
];

async function main() {
  console.log("Erasing existing data (demo reset)...");
  // Delete in FK-safe order
  await prisma.chatParticipant.deleteMany();
  await prisma.message.deleteMany();
  await prisma.wave.deleteMany();
  await prisma.report.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.chatSession.deleteMany();

  console.log("Seeding fake users with bcrypt-hashed passwords...");
  const usersWithHashed = await Promise.all(
    FAKE_USERS.map(async (u) => ({
      ...u,
      password: await bcrypt.hash(u.password, 12),
    }))
  );

  await prisma.user.createMany({ data: usersWithHashed });

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, interestTags: true },
    orderBy: { id: "asc" },
  });

  users.forEach((user) => {
    const tags = Array.isArray(user.interestTags) && user.interestTags.length
      ? user.interestTags.join(", ")
      : "none";
    console.log(`- ${user.name ?? user.email} (${user.email}) :: ${tags}`);
  });

  console.log(`Seed complete. Inserted ${users.length} users.`);
}

main()
  .catch((err) => {
    console.error("Seeding failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
