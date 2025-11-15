import { API_BASE_URL, fetchProfile, toCurrentUser, updateUserProfile } from "@/utils/api";

describe("utils/api", () => {
  describe("toCurrentUser", () => {
    it("normalizes fields and resolves profile pictures", () => {
      const result = toCurrentUser({
        id: "10",
        email: "user@example.com",
        name: null,
        interestTags: ["Outdoors", "outdoors", " ", "Music"],
        profilePicture: "/uploads/pic.png",
        visibility: "false",
        trustScore: "90",
      });

      expect(result).toEqual({
        id: 10,
        username: undefined,
        email: "user@example.com",
        name: undefined,
        createdAt: undefined,
        interestTags: ["Outdoors", "Music"],
        trustScore: 90,
        profilePicture: `${API_BASE_URL}/uploads/pic.png`,
        visibility: false,
      });
    });
  });

  describe("fetchProfile", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("requests /api/auth/me and returns normalized data", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 5, email: "test@example.com" }),
      } as Response;

      const fetchMock = jest.fn().mockResolvedValue(mockResponse);
      global.fetch = fetchMock as any;

      const profile = await fetchProfile("token-123");

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: "Bearer token-123" },
      });
      expect(profile.id).toBe(5);
      expect(profile.email).toBe("test@example.com");
    });

    it("throws with server-provided errors", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      } as Response;

      global.fetch = jest.fn().mockResolvedValue(mockResponse) as any;

      await expect(fetchProfile("token"))
        .rejects.toThrow("Unauthorized");
    });
  });

  describe("updateUserProfile", () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("throws when payload is empty", async () => {
      await expect(updateUserProfile(1, {}, "token"))
        .rejects.toThrow("No profile fields provided.");
    });

    it("sends a PATCH request with provided fields", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 1, email: "user@example.com" }),
      } as Response;

      const fetchMock = jest.fn().mockResolvedValue(mockResponse);
      global.fetch = fetchMock as any;

      const result = await updateUserProfile(
        1,
        { name: "User", visibility: false },
        "token"
      );

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/users/1`, {
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ name: "User", visibility: false }),
      });
      expect(result.id).toBe(1);
    });
  });
});
