import prisma from "../prisma";

const FAKE_USERS = [
  {
    email: "alice@example.com",
    password: "password123",
    name: "Alice Johnson",
    interestTags: ["Coffee", "Dogs", "Hiking"],
  },
  {
    email: "ben@example.com",
    password: "password123",
    name: "Ben Carter",
    interestTags: ["Board Games", "Tech", "Running"],
  },
  {
    email: "carla@example.com",
    password: "password123",
    name: "Carla Singh",
    interestTags: ["Yoga", "Live Music", "Art"],
  },
  {
    email: "diego@example.com",
    password: "password123",
    name: "Diego Martinez",
    interestTags: ["Soccer", "Cooking", "Photography"],
  },
  {
    email: "emily@example.com",
    password: "password123",
    name: "Emily Chen",
    interestTags: ["Coffee", "Books", "Travel"],
  },
];

async function main() {
  console.log("Seeding fake users...");

  await prisma.user.deleteMany();
  await prisma.user.createMany({ data: FAKE_USERS });

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, interestTags: true },
  });

  users.forEach((user: { id: number; email: string; name: string | null; interestTags: string[] | null }) => {
    const tags = user.interestTags?.length ? user.interestTags.join(", ") : "none";
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
