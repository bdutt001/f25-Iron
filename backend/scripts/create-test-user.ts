import 'dotenv/config';
import bcrypt from 'bcrypt';
import prisma from '../src/prisma';

async function main() {
  const email = `odu-test-${Date.now()}@example.com`;
  const password = 'Password123';
  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { email, password: hashed, name: 'ODU Demo' },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  console.log('Created test user:', user);
  console.log('Login credentials ->', { email, password });
}

main()
  .catch((err) => {
    console.error('Create test user failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
