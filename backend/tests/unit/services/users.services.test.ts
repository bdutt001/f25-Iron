import {
  buildConnectOrCreate,
  normalizeTagNames,
  serializeUser,
  type PrismaUserWithTags,
} from "../../../src/services/users.services";

describe("users.services helpers", () => {
  describe("normalizeTagNames", () => {
    it("trims, lowercases for uniqueness, and removes empty entries", () => {
      const input = ["  Hiking  ", "hiking", "Cycling", "", "  ", "Music", "MUSIC"];
      expect(normalizeTagNames(input)).toEqual(["Hiking", "Cycling", "Music"]);
    });

    it("returns an empty array when no valid tags are provided", () => {
      expect(normalizeTagNames(["", "   ", null as unknown as string])).toEqual([]);
    });
  });

  describe("buildConnectOrCreate", () => {
    it("builds Prisma connectOrCreate expressions", () => {
      expect(buildConnectOrCreate(["Hiking", "Music"])).toEqual([
        {
          where: { name: "Hiking" },
          create: { name: "Hiking" },
        },
        {
          where: { name: "Music" },
          create: { name: "Music" },
        },
      ]);
    });
  });

  describe("serializeUser", () => {
    it("converts Prisma payloads into serialized responses", () => {
      const prismaUser: PrismaUserWithTags = {
        id: 1,
        email: "user@example.com",
        name: "User",
        createdAt: new Date("2025-01-01T00:00:00Z"),
        profilePicture: null,
        interestTags: [{ name: "Outdoors" }, { name: "Tech" }],
        trustScore: 99,
        visibility: true,
      } as PrismaUserWithTags;

      expect(serializeUser(prismaUser)).toEqual({
        ...prismaUser,
        interestTags: ["Outdoors", "Tech"],
        profilePicture: null,
        visibility: true,
      });
    });

    it("defaults optional fields when Prisma returns nullish values", () => {
      const prismaUser = {
        id: 2,
        email: "nullish@example.com",
        name: null,
        createdAt: new Date("2025-02-01T00:00:00Z"),
        profilePicture: undefined,
        interestTags: [],
        trustScore: 80,
        visibility: undefined,
      } as unknown as PrismaUserWithTags;

      expect(serializeUser(prismaUser)).toEqual({
        id: 2,
        email: "nullish@example.com",
        name: null,
        createdAt: prismaUser.createdAt,
        profilePicture: null,
        interestTags: [],
        trustScore: 80,
        visibility: false,
      });
    });
  });
});
