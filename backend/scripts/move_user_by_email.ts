import "dotenv/config";
import prisma from "../src/prisma";
import { clampToRadius, destinationPoint, randomBetween, seededRandom } from "../src/utils/geo";

const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };
const MAX_RADIUS_METERS = 520;
const STEP_MIN_METERS = 100;
const STEP_MAX_METERS = 250;

const usage = () => {
  console.error("Usage: ts-node --transpile-only scripts/move_user_by_email.ts user@example.com");
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
      name: true,
      email: true,
      locations: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { latitude: true, longitude: true },
      },
    },
  });

  if (!user) {
    console.error(`User not found for email: ${email}`);
    process.exit(1);
  }

  const latest = user.locations[0];
  const startLat = latest?.latitude ?? ODU_CENTER.latitude;
  const startLon = latest?.longitude ?? ODU_CENTER.longitude;

  // Seeded randomness so repeated runs in the same moment are reproducible, but change over time.
  const seed = (Date.now() & 0xffffffff) ^ user.id;
  const rand = seededRandom(seed);

  const step = randomBetween(STEP_MIN_METERS, STEP_MAX_METERS, rand);
  const bearing = rand() * 2 * Math.PI;
  const next = destinationPoint(startLat, startLon, step, bearing);
  const clamped = clampToRadius(
    ODU_CENTER.latitude,
    ODU_CENTER.longitude,
    next.latitude,
    next.longitude,
    MAX_RADIUS_METERS
  );

  await prisma.userLocation.create({
    data: {
      userId: user.id,
      latitude: clamped.latitude,
      longitude: clamped.longitude,
    },
  });

  const label = user.name?.trim() || user.email;
  console.log(
    `Moved ${label} by ${step.toFixed(1)}m -> ${clamped.latitude.toFixed(6)}, ${clamped.longitude.toFixed(6)}`
  );
};

main()
  .catch((error) => {
    console.error("Failed to move user", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
