import type { NearbyUser } from "./geo";
import { haversineDistanceMeters, formatDistance } from "./geo";

export type RequesterProfile = {
  id: number;
  interestTags: string[];
  coords: { latitude: number; longitude: number };
};

export type RankedUser = NearbyUser & {
  distanceMeters: number;
  distanceLabel: string;
  score: number; // 0..1
  breakdown: { tagSim: number; distance: number }; //trust score tba(most are set to 0)
  sharedTags: string[];
};

const DEFAULTS = {
  weights: { tagSim: 0.7, distance: 0.3 },
  halfLifeMeters: 1200,  // reduces distance score by half every
};

const norm = (tags?: string[]) =>
  Array.from(new Set((tags ?? []).map(t => t.trim().toLowerCase()).filter(Boolean)));

const jaccard = (a: string[], b: string[]) => { //scores based on alike tags. removed dupes
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
};

// 2^(-d/halfLife) in (0,1]
const distanceScore = (d: number, halfLife: number) =>
  (!Number.isFinite(d) || d < 0 || halfLife <= 0) ? 0 : Math.pow(2, -d / halfLife);

export function rankNearbyUsers(
  requester: RequesterProfile,
  nearby: NearbyUser[],
  opts?: {
    weights?: Partial<typeof DEFAULTS.weights>;
    halfLifeMeters?: number;
    maxMeters?: number;
    excludeIds?: number[];
  }
): RankedUser[] {
  const weights = { ...DEFAULTS.weights, ...opts?.weights };
  const halfLife = opts?.halfLifeMeters ?? DEFAULTS.halfLifeMeters;
  const maxM = opts?.maxMeters;
  const exclude = new Set(opts?.excludeIds ?? []);

  const reqTags = norm(requester.interestTags);
  const { latitude: rLat, longitude: rLng } = requester.coords;

  const ranked: RankedUser[] = [];

  for (const u of nearby) {
    if (u.id === requester.id || exclude.has(u.id)) continue;

    const d = haversineDistanceMeters(rLat, rLng, u.coords.latitude, u.coords.longitude);
    if (maxM != null && d > maxM) continue;

    const candTags = norm(u.interestTags);
    const tagSim = jaccard(reqTags, candTags);
    const dScore = distanceScore(d, halfLife);

    const score = Math.max(0, Math.min(1, weights.tagSim * tagSim + weights.distance * dScore));

    ranked.push({
      ...u,
      distanceMeters: d,
      distanceLabel: formatDistance(d),
      score,
      breakdown: { tagSim, distance: dScore },
      sharedTags: reqTags.filter(t => candTags.includes(t)),
    });
  }

  // Tiebreaker: score desc, then more shared tags, then closer distance, then id asc
  ranked.sort((a, b) =>
    b.score - a.score ||
    b.sharedTags.length - a.sharedTags.length ||
    a.distanceMeters - b.distanceMeters ||
    a.id - b.id
  );
  return ranked;
}