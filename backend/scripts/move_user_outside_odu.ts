import "dotenv/config";
import prisma from "../src/prisma";
import { destinationPoint, randomBetween, seededRandom } from "../src/utils/geo";

const TARGET_CENTER = { latitude: 36.892703, longitude: -76.300946 };
const MIN_DISTANCE_METERS = 0; // allow center
const MAX_DISTANCE_METERS = 50; // within 50m of the target

const usage = () => {
  console.error("Usage: ts-node --transpile-only scripts/move_user_outside_odu.ts user@example.com");
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
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    console.error(`User not found for email: ${email}`);
    process.exit(1);
  }

  // Seeded randomness so repeated runs in the same moment are reproducible, but change over time.
  const seed = (Date.now() & 0xffffffff) ^ user.id;
  const rand = seededRandom(seed);

  const distance = randomBetween(MIN_DISTANCE_METERS, MAX_DISTANCE_METERS, rand);
  const bearing = rand() * 2 * Math.PI;
  const coords = destinationPoint(
    TARGET_CENTER.latitude,
    TARGET_CENTER.longitude,
    distance,
    bearing
  );

  await prisma.userLocation.create({
    data: {
      userId: user.id,
      latitude: coords.latitude,
      longitude: coords.longitude,
    },
  });

  const label = user.name?.trim() || user.email;
  console.log(
    `Moved ${label} to ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} (${Math.round(distance)}m from ODU center)`
  );
};

main()
  .catch((error) => {
    console.error("Failed to move user outside ODU radius", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
