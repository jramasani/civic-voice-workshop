import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import { createDb } from "./lib/db.js";
import { openai } from "./lib/openai.js";

const categories = ["Estate", "Transport", "Environment", "Other"];
const statuses = ["New", "In review", "Closed"];
const urgencies = ["Low", "Medium", "High"];
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const text = (value) => String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
const fallbackCategory = (message) => /bus|train|traffic|road|walkway|transport/i.test(message) ? "Transport" : /tree|park|rubbish|recycl|environment|drain/i.test(message) ? "Environment" : /lift|block|estate|void deck|neighbour/i.test(message) ? "Estate" : "Other";
const csv = (value) => { const v = String(value ?? "").replace(/\r?\n/g, " "); return `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replaceAll('"', '""')}"`; };

function passwordMatches(user, password) {
  if (!user?.passwordHash) return false;
  const hash = crypto.pbkdf2Sync(String(password ?? ""), user.passwordSalt, 120_000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.passwordHash, "hex"));
}

function list(db, query) {
  return [...db.data.feedback]
    .filter((item) => !query.category || item.category === query.category)
    .filter((item) => !query.status || item.status === query.status)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createApp(options = {}) {
  const db = options.db ?? await createDb();
  const ai = options.ai ?? openai;
  const sessions = options.sessions ?? new Map();
  const attempts = new Map();
  const app = express();
  app.use(cors()); app.use(express.json());
  const auth = (role) => (req, res, next) => {
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const session = token && sessions.get(token);
    if (!session) return fail(res, 401, "UNAUTHENTICATED", "Please sign in to continue.");
    if (role && session.role !== role) return fail(res, 403, "FORBIDDEN", `${role === "admin" ? "Admin" : "Citizen"} access required.`);
    req.session = session; next();
  };
  const find = (id) => db.data.feedback.find((item) => item.id === id);
  const adminItem = (req, res) => { const item = find(req.params.id); if (!item) { fail(res, 404, "NOT_FOUND", "Feedback was not found."); return null; } return item; };

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "civic-voice-api" }));
  app.post("/api/login", (req, res) => {
    const { nric, password, role } = req.body ?? {}; const key = `${req.ip}:${nric}`; const now = Date.now();
    const recent = (attempts.get(key) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= 5) return fail(res, 429, "RATE_LIMITED", "Too many failed sign-in attempts. Please wait a minute and try again.");
    const user = db.data.users.find((item) => item.nric === String(nric ?? "").toUpperCase() && item.role === role);
    if (!user || !passwordMatches(user, password)) { recent.push(now); attempts.set(key, recent); return fail(res, 401, "INVALID_CREDENTIALS", "Invalid NRIC, password, or sign-in mode."); }
    attempts.delete(key); const token = crypto.randomBytes(32).toString("base64url"); sessions.set(token, { nric: user.nric, name: user.name, role: user.role });
    res.json({ token, user: sessions.get(token) });
  });
  app.get("/api/feedback/export", auth("admin"), (req, res) => {
    const columns = ["reference", "name", "nric", "message", "category", "status", "createdAt"];
    res.type("text/csv").attachment("civicvoice-feedback.csv").send([columns.join(","), ...list(db, req.query).map((item) => columns.map((key) => csv(item[key])).join(","))].join("\n"));
  });
  app.get("/api/feedback", auth("admin"), (req, res) => {
    if (req.query.category && !categories.includes(req.query.category)) return fail(res, 400, "VALIDATION_ERROR", "Choose a valid feedback category.");
    if (req.query.status && !statuses.includes(req.query.status)) return fail(res, 400, "VALIDATION_ERROR", "Choose a valid feedback status.");
    const all = list(db, req.query), limit = Math.min(Math.max(+req.query.limit || 10, 1), 100), pages = Math.max(1, Math.ceil(all.length / limit)), page = Math.min(Math.max(+req.query.page || 1, 1), pages);
    res.json({ feedback: all.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: all.length, pages } });
  });
  app.post("/api/feedback", auth("citizen"), async (req, res) => {
    const message = text(req.body?.message); if (!message) return fail(res, 400, "VALIDATION_ERROR", "Please enter feedback that is not blank."); if (message.length > 500) return fail(res, 400, "VALIDATION_ERROR", "Feedback must be 500 characters or fewer.");
    if (req.body?.category && !categories.includes(req.body.category)) return fail(res, 400, "VALIDATION_ERROR", "Choose a valid feedback category.");
    let category = req.body?.category || fallbackCategory(message); try { if (!req.body?.category && ai.categorize) { const value = await ai.categorize(message); if (categories.includes(value)) category = value; } } catch { /* local fallback */ }
    const feedback = { id: crypto.randomUUID(), reference: `CV-${crypto.randomInt(100000, 1000000)}`, nric: req.session.nric, name: req.session.name, message, category, status: "New", createdAt: new Date().toISOString() };
    db.data.feedback.unshift(feedback); await db.write(); res.status(201).json({ feedback, reference: feedback.reference });
  });
  app.get("/api/feedback/:id", auth("admin"), (req, res) => { const item = adminItem(req, res); if (item) res.json({ feedback: item }); });
  app.patch("/api/feedback/:id", auth("admin"), async (req, res) => { const item = adminItem(req, res); if (!item) return; if (!statuses.includes(req.body?.status)) return fail(res, 400, "VALIDATION_ERROR", "Choose a valid feedback status."); item.status = req.body.status; await db.write(); res.json({ feedback: item }); });
  app.post("/api/feedback/:id/summary", auth("admin"), async (req, res) => { const item = adminItem(req, res); if (!item) return; if (item.summary) return res.json({ summary: item.summary, cached: true }); if (item.message.length <= 200) return res.json({ summary: item.message, cached: false }); if (!ai.summarize) return fail(res, 503, "AI_UNAVAILABLE", "Summaries are not configured."); try { item.summary = text(await ai.summarize(item.message)); await db.write(); res.json({ summary: item.summary, cached: false }); } catch { fail(res, 502, "AI_FAILED", "A summary could not be generated. Your original feedback is still available."); } });
  app.post("/api/feedback/:id/translation", auth("admin"), async (req, res) => { const item = adminItem(req, res); if (!item) return; if (item.translation) return res.json({ translation: item.translation, cached: true }); if (!ai.translate) return fail(res, 503, "AI_UNAVAILABLE", "Translations are not configured."); try { item.translation = text(await ai.translate(item.message)); item.translationLanguage = "English"; await db.write(); res.json({ translation: item.translation, cached: false }); } catch { fail(res, 502, "AI_FAILED", "A translation could not be generated. The original feedback remains available."); } });
  app.post("/api/feedback/:id/routing-suggestion", auth("admin"), async (req, res) => { const item = adminItem(req, res); if (!item) return; if (!ai.suggestRouting) return fail(res, 503, "AI_UNAVAILABLE", "Routing suggestions are not configured."); try { const suggestion = await ai.suggestRouting(item.message); if (!suggestion || !urgencies.includes(suggestion.urgency) || !text(suggestion.team)) return fail(res, 502, "AI_INVALID_RESPONSE", "The routing suggestion was invalid."); item.routingSuggestion = { urgency: suggestion.urgency, team: text(suggestion.team) }; await db.write(); res.json({ suggestion: item.routingSuggestion }); } catch { fail(res, 502, "AI_FAILED", "A routing suggestion could not be generated."); } });
  app.patch("/api/feedback/:id/routing-suggestion", auth("admin"), async (req, res) => { const item = adminItem(req, res); if (!item) return; if (!item.routingSuggestion) return fail(res, 400, "NO_SUGGESTION", "There is no routing suggestion to action."); if (req.body?.action === "accept") Object.assign(item, { urgency: item.routingSuggestion.urgency, responsibleTeam: item.routingSuggestion.team }); else if (req.body?.action !== "dismiss") return fail(res, 400, "VALIDATION_ERROR", "Choose accept or dismiss."); delete item.routingSuggestion; await db.write(); res.json({ feedback: item }); });
  app.post("/api/feedback/:id/audio", auth("citizen"), async (req, res) => { const item = find(req.params.id); if (!item || item.nric !== req.session.nric) return fail(res, 404, "NOT_FOUND", "Feedback was not found."); if (!text(item.message)) return fail(res, 400, "VALIDATION_ERROR", "Blank feedback cannot be synthesized."); if (!ai.synthesize) return fail(res, 503, "AI_UNAVAILABLE", "Audio is not configured."); try { res.json(await ai.synthesize(item.message)); } catch { fail(res, 502, "AI_FAILED", "Audio could not be generated."); } });
  app.use((req, res) => fail(res, 404, "NOT_FOUND", `No route matches ${req.method} ${req.path}.`));
  return app;
}
