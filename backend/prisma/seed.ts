import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "ashaf007@odu.edu" }, // use email as the unique key
    update: {
      name: "Ahmer Shafiq",
      password: "test123",   // only for dev/testing, don’t store plain passwords in prod!
      status: "AVAILABLE",
      profilePicture: null,
    },
    create: {
      id: 1, // force ID = 1 so frontend calls work
      email: "ashaf007@odu.edu",
      name: "Ahmer Shafiq",
      password: "test123",
      status: "AVAILABLE",
      profilePicture: null,
    },
  });

  console.log("Seeded user:", user);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
