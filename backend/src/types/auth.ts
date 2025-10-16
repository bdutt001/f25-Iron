export interface AuthenticatedUser {
  id: number;
  username?: string;
  email: string | null;
  profilePicture: string | null; // ✅ add this
}
