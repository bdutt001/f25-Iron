/**
 * AuthenticatedUser type
 *
 * Represents the safe, minimal user data returned to the client after authentication.
 */
export interface AuthenticatedUser {
  id: number;
  email: string | null;
  name?: string | null;
  profilePicture: string | null;
  interestTags?: string[];
  visibility: boolean;
  profileStatus?: string | null; // ? from profileView branch
  lastLogin?: string | null; // ? from main
  trustScore?: number;
  isAdmin?: boolean;
  banned?: boolean;
  bannedAt?: string | null;
  banReason?: string | null;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
  googleId?: string | null;
  appleId?: string | null;
  deviceFingerprint?: string | null;
}
