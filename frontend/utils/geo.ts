export type ApiUser = {
  id: number;
  email: string;
  name?: string | null;
  interestTags?: string[] | null;
};

export type NearbyUser = {
  id: number;
  name: string;
  email: string;
  interestTags: string[];
  coords: {
    latitude: number;
    longitude: number;
  };
};

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function stableOffsets(seed: number) {
  const base = seed || 1;
  const angle = seededRandom(base * 1.37) * 2 * Math.PI;
  const radius = 0.003 + seededRandom(base * 3.11) * 0.002; // roughly 300-500m
  const latOffset = Math.sin(angle) * radius;
  const lngOffset = Math.cos(angle) * radius;
  return { latOffset, lngOffset };
}

function toInterestTags(raw: ApiUser["interestTags"]): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((tag) => typeof tag === "string" && tag.trim().length > 0);
  }
  return [];
}

export function scatterUsersAround(
  users: ApiUser[],
  baseLat: number,
  baseLng: number
): NearbyUser[] {
  if (!users.length) return [];

  return users.map((user) => {
    const seed = typeof user.id === "number" ? user.id : seededRandom(user.email?.length ?? 1) * 1000;
    const { latOffset, lngOffset } = stableOffsets(seed);

    return {
      id: user.id,
      email: user.email,
      name: user.name ?? user.email,
      interestTags: toInterestTags(user.interestTags),
      coords: {
        latitude: baseLat + latOffset,
        longitude: baseLng + lngOffset,
      },
    };
  });
}

const EARTH_RADIUS_METERS = 6371000;

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function formatDistance(meters: number): string {
  if (Number.isNaN(meters)) return "Unknown";
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
