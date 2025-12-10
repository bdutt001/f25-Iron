import { randomPointAround } from "../utils/geo";

// ODU campus center (Kaufman Mall) — matches seed script reference.
export const ODU_CENTER = {
  latitude: 36.885,
  longitude: -76.305,
};

// Keep new accounts within a small radius so they're near campus but not identical.
export const ODU_RANDOM_RADIUS_METERS = 450;

/**
 * Generates a pseudo-random point near ODU, using the same distribution as the seed script.
 */
export const randomOduLocation = (rand: () => number = Math.random) => {
  const { latitude, longitude } = randomPointAround(
    ODU_CENTER.latitude,
    ODU_CENTER.longitude,
    ODU_RANDOM_RADIUS_METERS,
    rand
  );

  return { latitude, longitude };
};
