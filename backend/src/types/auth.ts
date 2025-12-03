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
  profileStatus?: string | null;
}
