import "dotenv/config";
import prisma from "../src/prisma";
import { destinationPoint, seededRandom } from "../src/utils/geo";

const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };
const MAX_RADIUS_METERS = 450;
const RUN_SEED = Number(process.env.SEED_RUN) || Date.now();

const main = async () => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });

  console.log(
    `Seeding locations for ${users.length} users around ODU (${MAX_RADIUS_METERS}m max)... [runSeed=${RUN_SEED}]`
  );

  for (const user of users) {
    // Mix a per-run seed with the user id so each run shifts everyone, but stays reproducible if SEED_RUN is provided.
    const rand = seededRandom(user.id + RUN_SEED);
    const distance = Math.sqrt(rand()) * MAX_RADIUS_METERS; // uniform distribution within the circle
    const bearing = rand() * 2 * Math.PI;
    const coords = destinationPoint(ODU_CENTER.latitude, ODU_CENTER.longitude, distance, bearing);

    await prisma.userLocation.create({
      data: {
        userId: user.id,
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
    });

    const label = user.name?.trim() || user.email;
    console.log(
      `  ${label} -> ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} (${Math.round(distance)}m)`
    );
  }
};

main()
  .catch((error) => {
    console.error("Failed to seed locations", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
