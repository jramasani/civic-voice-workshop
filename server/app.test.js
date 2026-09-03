import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDb } from "./lib/db.js";

async function testApp(options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "civic-voice-"));
  const db = await createDb(path.join(directory, "db.json"));
  return createApp({ db, ...options });
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
    expect(response.status).toBe(401);
  });

  it("does not let a signed-in citizen escalate with a spoofed role header", async () => {
    const app = await testApp();
    const token = await session(app);
    const response = await request(app).get("/api/feedback").set("Authorization", `Bearer ${token}`).set("x-user-role", "admin");
    expect(response.status).toBe(403);
  });

  it("rejects blank feedback on the API", async () => {
    const app = await testApp();
    const token = await session(app);
    const response = await request(app).post("/api/feedback").set("Authorization", `Bearer ${token}`).send({ message: " \n " });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("uses an opaque session rather than a reversible identifier", async () => {
    const app = await testApp();
    const token = await session(app, "admin");
    expect(token).not.toContain("S0000002B");
    expect((await request(app).get("/api/feedback").set("Authorization", `Bearer ${token}`)).status).toBe(200);
  });

  it("returns newest feedback first, filters, paginates, and exports CSV", async () => {
    const app = await testApp();
    const citizen = await session(app), admin = await session(app, "admin");
    await request(app).post("/api/feedback").set("Authorization", `Bearer ${citizen}`).send({ message: "A bus service improvement", category: "Transport" });
    const list = await request(app).get("/api/feedback?category=Transport&limit=1").set("Authorization", `Bearer ${admin}`);
    expect(list.body.feedback).toHaveLength(1);
    expect(list.body.feedback[0].category).toBe("Transport");
    expect(list.body.pagination.total).toBe(1);
    const csv = await request(app).get("/api/feedback/export?category=Transport").set("Authorization", `Bearer ${admin}`);
    expect(csv.type).toMatch(/text\/csv/);
    expect(csv.text).toContain("A bus service improvement");
  });

  it("persists an admin status update and exposes detail", async () => {
    const app = await testApp();
    const token = await session(app, "admin");
    const inbox = await request(app).get("/api/feedback").set("Authorization", `Bearer ${token}`);
    const id = inbox.body.feedback[0].id;
    const changed = await request(app).patch(`/api/feedback/${id}`).set("Authorization", `Bearer ${token}`).send({ status: "In review" });
    expect(changed.body.feedback.status).toBe("In review");
    expect((await request(app).get(`/api/feedback/${id}`).set("Authorization", `Bearer ${token}`)).body.feedback.id).toBe(id);
  });

  it("uses injected AI only on the server and caches a generated summary", async () => {
    const ai = { categorize: async () => "Environment", summarize: async () => "A short summary.", translate: async () => "English text.", suggestRouting: async () => ({ urgency: "High", team: "Estate Operations" }) };
    const app = await testApp({ ai });
    const citizen = await session(app), admin = await session(app, "admin");
    const created = await request(app).post("/api/feedback").set("Authorization", `Bearer ${citizen}`).send({ message: "x".repeat(220) });
    expect(created.body.feedback.category).toBe("Environment");
    const summary = await request(app).post(`/api/feedback/${created.body.feedback.id}/summary`).set("Authorization", `Bearer ${admin}`);
    expect(summary.body.summary).toBe("A short summary.");
    const cached = await request(app).post(`/api/feedback/${created.body.feedback.id}/summary`).set("Authorization", `Bearer ${admin}`);
    expect(cached.body.cached).toBe(true);
  });
});
