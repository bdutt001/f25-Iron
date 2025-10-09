import bcrypt from "bcrypt";
import request from "supertest";
import app from "../src/app";
import prisma from "../src/prisma";

beforeAll(async () => {
  // Clear users before running tests (so duplicate emails won't break things)
  await prisma.user.deleteMany();
});

describe("Health check", () => {
  it("should return Hello from Express 🚀", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("Hello from Express 🚀");
  });
});

describe("User API", () => {
  let userId: number;

  it("should create a new user", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({
        email: "alice@example.com",
        name: "Alice",
        password: "secret123",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    userId = res.body.id;

    const createdUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    expect(createdUser).not.toBeNull();
    expect(createdUser?.password).not.toBe("secret123");
    const matches = await bcrypt.compare("secret123", createdUser!.password);
    expect(matches).toBe(true);
  });

  it("should return 400 when creating a user without email", async () => {
    const res = await request(app).post("/users").send({ name: "No Email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Email is required");
  });

  it("should fetch all users", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("should fetch a single user by id", async () => {
    const res = await request(app).get(`/api/users/${userId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(userId);
  });

  it("should return 404 when fetching a non-existent user", async () => {
    const res = await request(app).get("/api/users/999999"); // numeric non-existent ID
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });

  it("should update a user", async () => {
    const res = await request(app)
      .patch(`/api/users/${userId}`) // use PATCH consistently
      .send({ name: "Alice Updated" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Alice Updated");
  });

  it("should return 404 when updating a non-existent user", async () => {
    const res = await request(app)
      .patch("/api/users/999999") // numeric non-existent ID
      .send({ name: "Ghost User" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });

  it("should delete a user", async () => {
    const res = await request(app).delete(`/api/users/${userId}`);
    expect(res.status).toBe(204);
  });

  it("should return 404 when deleting the same user again", async () => {
    const res = await request(app).delete(`/api/users/${userId}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });
});
