import "dotenv/config";
import prisma from "../src/prisma";

const usage = () => {
  console.error("Usage: ts-node scripts/promoteAdmin.ts <email>");
};

const main = async () => {
  const emailArg = process.argv[2];
  const email = typeof emailArg === "string" ? emailArg.trim().toLowerCase() : "";

  if (!email) {
    usage();
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      visibility: true,
      banned: true,
    },
  });

  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  if (user.isAdmin) {
    console.log(`User ${user.email} (id=${user.id}) is already an admin.`);
    process.exit(0);
  }

  const updated = await prisma.user.update({
    where: { email },
    data: {
      isAdmin: true,
      visibility: false,
      banned: false,
      bannedAt: null,
      banReason: null,
      bannedByAdminId: null,
    },
    select: {
      id: true,
      email: true,
      isAdmin: true,
      visibility: true,
      banned: true,
    },
  });

  const label = user.name?.trim() || updated.email;
  console.log(`✅ Promoted user ${label} (id=${updated.id}) to admin.`);
};

main()
  .catch((err) => {
    console.error("Error promoting admin:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
