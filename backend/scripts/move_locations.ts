import "dotenv/config";
import prisma from "../src/prisma";
import { clampToRadius, destinationPoint, randomBetween, seededRandom } from "../src/utils/geo";

const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };
const MAX_RADIUS_METERS = 520;
const STEP_MIN_METERS = 10;
const STEP_MAX_METERS = 50;

const main = async () => {
  const users = await prisma.user.findMany({
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

  console.log(
    `Moving ${users.length} users by ${STEP_MIN_METERS}-${STEP_MAX_METERS}m and clamping to ${MAX_RADIUS_METERS}m around ODU...`
  );

  for (const user of users) {
    const latest = user.locations[0];
    const startLat = latest?.latitude ?? ODU_CENTER.latitude;
    const startLon = latest?.longitude ?? ODU_CENTER.longitude;

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
      `  ${label}: step ${step.toFixed(1)}m, now at ${clamped.latitude.toFixed(6)}, ${clamped.longitude.toFixed(6)}`
    );
  }
};

main()
  .catch((error) => {
    console.error("Failed to move locations", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
