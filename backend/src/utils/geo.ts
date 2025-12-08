const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export const haversineMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
};

export const destinationPoint = (
  latitude: number,
  longitude: number,
  distanceMeters: number,
  bearingRadians: number
): { latitude: number; longitude: number } => {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const lat1 = toRadians(latitude);
  const lon1 = toRadians(longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRadians)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { latitude: toDegrees(lat2), longitude: toDegrees(lon2) };
};

export const bearingBetween = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const dLon = toRadians(lon2 - lon1);
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);

  return Math.atan2(
    Math.sin(dLon) * Math.cos(phi2),
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon)
  );
};

export const clampToRadius = (
  centerLat: number,
  centerLon: number,
  targetLat: number,
  targetLon: number,
  maxRadiusMeters: number
): { latitude: number; longitude: number; distanceMeters: number } => {
  const distance = haversineMeters(centerLat, centerLon, targetLat, targetLon);
  if (!Number.isFinite(distance) || distance <= maxRadiusMeters) {
    return { latitude: targetLat, longitude: targetLon, distanceMeters: distance };
  }

  const bearing = bearingBetween(centerLat, centerLon, targetLat, targetLon);
  const clamped = destinationPoint(centerLat, centerLon, maxRadiusMeters, bearing);
  return { ...clamped, distanceMeters: maxRadiusMeters };
};

export const randomBetween = (min: number, max: number, rand: () => number = Math.random) =>
  min + (max - min) * rand();

export const seededRandom = (seed: number): (() => number) => {
  // Mulberry32
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const randomPointAround = (
  centerLat: number,
  centerLon: number,
  maxRadiusMeters: number,
  rand: () => number = Math.random
): { latitude: number; longitude: number; distanceMeters: number } => {
  const r = Math.sqrt(rand()) * maxRadiusMeters; // uniform distribution over circle
  const bearing = rand() * 2 * Math.PI;
  const coords = destinationPoint(centerLat, centerLon, r, bearing);
  return { ...coords, distanceMeters: r };
};
