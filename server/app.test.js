import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDb } from "./lib/db.js";

async function testApp() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "civic-voice-"));
  const db = await createDb(path.join(directory, "db.json"));
  return createApp({ db });
}

async function session(app, role = "citizen") {
  const credentials = role === "admin"
    ? { nric: "S0000002B", password: "admin123", role }
    : { nric: "S0000001A", password: "citizen123", role };
  const response = await request(app).post("/api/login").send(credentials);
  return response.body.token;
}

describe("CivicVoice baseline API", () => {
  it("creates a missing datastore directory on first use", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "civic-voice-"));
    const db = await createDb(path.join(directory, "missing", "data", "db.json"));
    expect(db.data.users).toHaveLength(2);
  });

  it("logs in the seeded citizen", async () => {
    const app = await testApp();
    const response = await request(app).post("/api/login").send({
      nric: "S0000001A", password: "citizen123", role: "citizen",
    });
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("citizen");
  });

  it("accepts feedback", async () => {
    const app = await testApp();
    const token = await session(app);
    const response = await request(app).post("/api/feedback").send({
      nric: "S0000001A", name: "Aisha Rahman", message: "Please add more benches.",
    }).set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(201);
    expect(response.body.feedback.message).toBe("Please add more benches.");
  });

  it("blocks the feedback list without an opaque admin session", async () => {
    const app = await testApp();
    const response = await request(app).get("/api/feedback");
    expect(response.status).toBe(403);
  });

  it("does not trust a spoofed role header", async () => {
    const app = await testApp();
    const response = await request(app).get("/api/feedback").set("x-user-role", "admin");
    expect(response.status).toBe(401);
  });

  it("rejects blank feedback on the API", async () => {
    const app = await testApp();
    const token = await session(app);
    const response = await request(app).post("/api/feedback").set("Authorization", `Bearer ${token}`).send({ message: " \n " });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
