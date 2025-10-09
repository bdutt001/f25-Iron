import bcrypt from "bcrypt";
import prisma from "../prisma";

// Seed the database with the real team members from README.md
// Passwords are left as the demo default for class use only
const TEAM_USERS: { email: string; name: string; password: string }[] = [
  { email: "bdutt001@odu.edu", name: "Ben Dutton", password: "Password123" },
  { email: "ghayn004@odu.edu", name: "Geelani Haynes", password: "Password123" },
  { email: "jneff001@odu.edu", name: "Jacob Neff", password: "Password123" },
  { email: "ashaf007@odu.edu", name: "Ahmer Shafiq", password: "Password123" },
  { email: "tmose008@odu.edu", name: "Taran Moses", password: "Password123" },
  { email: "nbrew004@odu.edu", name: "Nicholas Brewster", password: "Password123" },
  { email: "dpate024@odu.edu", name: "Daksh Patel", password: "Password123" },
  { email: "dmelt002@odu.edu", name: "Dustin Dobson", password: "Password123" },
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

  console.log("Seeding team users from README.md...");
  const usersWithHashedPasswords = await Promise.all(
    TEAM_USERS.map(async (user) => ({
      ...user,
      password: await bcrypt.hash(user.password, 10),
    }))
  );

  await prisma.user.createMany({ data: usersWithHashedPasswords });

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
