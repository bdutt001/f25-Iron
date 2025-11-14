import bcrypt from "bcrypt";
import request from "supertest";
import app from "../../src/app";
import prisma from "../../src/prisma";

const AUTH_PREFIX = "/auth";
const API_PREFIX = "/api";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

if (!hasDatabaseUrl) {
  console.warn(
    "[integration] DATABASE_URL is not set. Backend integration tests are skipped."
  );
}

const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const uniqueSuffix = Date.now();
const credentials = {
  email: `alice.integration+${uniqueSuffix}@example.com`,
  password: "Secret123!",
  name: "Alice Integration",
};

const adminCredentials = {
  email: credentials.email,
  password: credentials.password,
};

describeIfDb("Auth + Users API", () => {
  const trackedUserIds = new Set<number>();
  let accessToken: string;
  let refreshToken: string;
  let userId: number;
  let createdUserId: number;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (trackedUserIds.size > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: Array.from(trackedUserIds) } },
      });
    }

    await prisma.$disconnect();
  });

  describe("Auth API", () => {
    it("registers a new account and returns tokens", async () => {
      const res = await request(app)
        .post(`${AUTH_PREFIX}/register`)
        .send(credentials);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
      expect(res.body).toHaveProperty("user");

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
      userId = res.body.user.id;
      trackedUserIds.add(userId);

      const stored = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true },
      });

      expect(stored).not.toBeNull();
      const matches = await bcrypt.compare(credentials.password, stored!.password);
      expect(matches).toBe(true);
    });

    it("logs in with email", async () => {
      const res = await request(app).post(`${AUTH_PREFIX}/login`).send({
        email: credentials.email,
        password: credentials.password,
      });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it("refreshes tokens", async () => {
      const res = await request(app).post(`${AUTH_PREFIX}/refresh`).send({
        refreshToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it("returns profile for authenticated user", async () => {
      const res = await request(app)
        .get(`${AUTH_PREFIX}/me`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(userId);
      expect(res.body.email).toBe(credentials.email);
    });

    it("logs out and invalidates the session", async () => {
      const res = await request(app)
        .post(`${AUTH_PREFIX}/logout`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(204);

      const meRes = await request(app)
        .get(`${AUTH_PREFIX}/me`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(meRes.status).toBe(401);
    });
  });

  describe("Users API (protected)", () => {
    beforeAll(async () => {
      const res = await request(app).post(`${AUTH_PREFIX}/login`).send(adminCredentials);

      expect(res.status).toBe(200);
      accessToken = res.body.accessToken;
    });

    const uniqueUserEmail = `bob.integration+${uniqueSuffix}@example.com`;
    const newUserPassword = "Secret456!";

    it("creates a new user", async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/users`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          email: uniqueUserEmail,
          password: newUserPassword,
          name: "Bob",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.email).toBe(uniqueUserEmail);

      createdUserId = res.body.id;
      trackedUserIds.add(createdUserId);

      const stored = await prisma.user.findUnique({
        where: { id: createdUserId },
        select: { password: true },
      });

      expect(stored).not.toBeNull();
      const matches = await bcrypt.compare(newUserPassword, stored!.password);
      expect(matches).toBe(true);
    });

    it("fetches all users", async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/users`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it("fetches a single user by id", async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/users/${createdUserId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdUserId);
    });

    it("updates a user", async () => {
      const res = await request(app)
        .patch(`${API_PREFIX}/users/${createdUserId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Bob Updated" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Bob Updated");
    });

    it("deletes a user", async () => {
      const res = await request(app)
        .delete(`${API_PREFIX}/users/${createdUserId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(204);
      trackedUserIds.delete(createdUserId);
    });

    it("returns 404 when deleting the same user again", async () => {
      const res = await request(app)
        .delete(`${API_PREFIX}/users/${createdUserId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("User not found");
    });
  });
});
