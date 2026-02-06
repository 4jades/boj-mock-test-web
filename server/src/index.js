import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

import { CONFIG } from "./config.js";
import { cleanupExpiredSessions, createParticipant, createSession, ensureProblemResults, getParticipantById, getParticipantByName, getParticipantCodes, getProblemResults, getRunLogs, getSession, insertRunLog, listParticipants, markParticipantFinished, setParticipantPassword, trimRunLog, updateProblemResult, upsertParticipantCode } from "./db.js";
import { fetchCandidates, pickN, validateHandles } from "./solved.js";
import { fetchProblemPage } from "./boj.js";
import { emitEvent, subscribe } from "./events.js";
import { runCases } from "./runner.js";
import crypto from "crypto";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "512kb" }));

if (process.env.NODE_ENV !== "production") {
  app.use(cors({ origin: true, credentials: true }));
}

const problemCache = new Map();
const PROBLEM_CACHE_TTL = 10 * 60 * 1000;

function setProblemCache(problemId, payload) {
  problemCache.set(problemId, { payload, ts: Date.now() });
}

function getProblemCache(problemId) {
  const entry = problemCache.get(problemId);
  if (!entry) return null;
  if (Date.now() - entry.ts > PROBLEM_CACHE_TTL) {
    problemCache.delete(problemId);
    return null;
  }
  return entry.payload;
}

async function pickValidByFetching(candidates, need, opts = {}) {
  const requireSamples = opts.requireSamples ?? false;
  const maxTry = Math.max(need, 1) * (opts.maxTryMultiplier ?? 30);

  const pool = candidates.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const picked = [];

  for (let i = 0; i < pool.length && picked.length < need && i < maxTry; i++) {
    const c = pool[i];
    try {
      const payload = await fetchProblemPage(c.problemId);
      setProblemCache(c.problemId, payload);
      if (requireSamples && (!payload.samples || payload.samples.length === 0)) continue;
      picked.push({ problemId: c.problemId, title: c.title });
    } catch {
      continue;
    }
  }

  return picked;
}

const runningBySession = new Map();
const lastRunByParticipant = new Map();

function hashPassword(sessionId, displayName, password) {
  return crypto
    .createHash("sha256")
    .update(`${sessionId}:${displayName}:${password}`)
    .digest("hex");
}

function incSessionRun(sessionId) {
  const cur = runningBySession.get(sessionId) || 0;
  if (cur >= CONFIG.maxConcurrentRunsPerSession) return false;
  runningBySession.set(sessionId, cur + 1);
  return true;
}

function decSessionRun(sessionId) {
  const cur = runningBySession.get(sessionId) || 0;
  runningBySession.set(sessionId, Math.max(0, cur - 1));
}

function getSessionEndAt(session) {
  const base = session.startAt ?? session.createdAt ?? Date.now();
  return base + session.minutes * 60 * 1000;
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.post("/api/handles/validate", async (req, res) => {
  try {
    const { handles } = req.body || {};
    if (!Array.isArray(handles) || handles.length === 0) return res.status(400).json({ error: "handles가 필요합니다." });
    const result = await validateHandles(handles);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/session/solo", async (req, res) => {
  try {
    const { handles, minTier, maxTier, minutes, count = 3, problemIds } = req.body || {};
    const problemCount = Number(count || 3);

    let picked = [];
    if (Array.isArray(problemIds) && problemIds.length) {
      const ids = problemIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
      if (!ids.length) return res.status(400).json({ error: "problemIds가 올바르지 않습니다." });
      picked = ids.map((id) => ({ problemId: id, title: `BOJ ${id}` }));
    } else {
      if (!Array.isArray(handles) || handles.length === 0) {
        return res.status(400).json({ error: "handles가 필요합니다." });
      }
      if (!minTier || !maxTier) return res.status(400).json({ error: "tier 범위가 필요합니다." });

      const candidates = await fetchCandidates(handles, String(minTier), String(maxTier));
      if (candidates.length < problemCount) {
        return res.status(400).json({ error: "조건에 맞는 문제가 부족합니다." });
      }

      picked = await pickValidByFetching(candidates, problemCount, { requireSamples: true, maxTryMultiplier: 50 });
      if (picked.length < problemCount) {
        return res.status(400).json({ error: "유효한 문제를 충분히 찾지 못했습니다." });
      }
    }
    if (!minutes || Number(minutes) <= 0) return res.status(400).json({ error: "minutes가 필요합니다." });

    const sessionId = nanoid();
    const startAt = Date.now();
    createSession({
      sessionId,
      minutes: Number(minutes),
      hideMeta: true,
      problemIds: picked.map((p) => p.problemId),
      startAt,
    });

    const problems = await Promise.all(
      picked.map(async (p) => {
        let payload = getProblemCache(p.problemId);
        if (!payload) {
          payload = await fetchProblemPage(p.problemId);
          setProblemCache(p.problemId, payload);
        }
        return {
          id: p.problemId,
          title: undefined,
          sectionsHtml: {
            descHtml: payload.descHtml,
            inputHtml: payload.inputHtml,
            outputHtml: payload.outputHtml,
          },
          samples: payload.samples,
        };
      })
    );

    res.json({ sessionId, problems, minutes: Number(minutes), hideMeta: true, startAt, started: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/session/group", async (req, res) => {
  try {
    const { handles, minTier, maxTier, minutes, count = 3, startAfterMinutes, startAt, problemIds } = req.body || {};

    const problemCount = Number(count || 3);
    let picked = [];
    if (Array.isArray(problemIds) && problemIds.length) {
      const ids = problemIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
      if (!ids.length) return res.status(400).json({ error: "problemIds가 올바르지 않습니다." });
      picked = ids.map((id) => ({ problemId: id, title: `BOJ ${id}` }));
    } else {
      if (!Array.isArray(handles) || handles.length === 0) return res.status(400).json({ error: "handles가 필요합니다." });
      if (!minTier || !maxTier) return res.status(400).json({ error: "tier 범위가 필요합니다." });

      const candidates = await fetchCandidates(handles, String(minTier), String(maxTier));
      if (candidates.length < problemCount) {
        return res.status(400).json({ error: "조건에 맞는 문제가 부족합니다." });
      }

      picked = await pickValidByFetching(candidates, problemCount, { requireSamples: true, maxTryMultiplier: 50 });
      if (picked.length < problemCount) {
        return res.status(400).json({ error: "유효한 문제를 충분히 찾지 못했습니다." });
      }
    }
    if (!minutes || Number(minutes) <= 0) return res.status(400).json({ error: "minutes가 필요합니다." });

    const sessionId = nanoid();
    let startAtMs = Date.now();
    if (startAt) {
      const t = Date.parse(startAt);
      if (Number.isNaN(t)) return res.status(400).json({ error: "startAt이 올바르지 않습니다." });
      startAtMs = t;
    } else {
      const delayMin = Number(startAfterMinutes || 0);
      startAtMs = Date.now() + Math.max(0, delayMin) * 60 * 1000;
    }
    createSession({
      sessionId,
      minutes: Number(minutes),
      hideMeta: true,
      problemIds: picked.map((p) => p.problemId),
      startAt: startAtMs,
    });

    res.json({ sessionId, startAt: startAtMs, started: false });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/session/:id/join", async (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = getSession(sessionId);
    if (!session) return res.status(404).json({ error: "세션이 없습니다." });

    const { displayName, bojHandle, password } = req.body || {};
    if (!displayName || !String(displayName).trim()) return res.status(400).json({ error: "닉네임이 필요합니다." });
    if (!password || !String(password).trim()) return res.status(400).json({ error: "비밀번호가 필요합니다." });
    const passwordHash = hashPassword(sessionId, String(displayName).trim(), String(password));

    const exists = getParticipantByName(sessionId, String(displayName).trim());
    let participantId = exists?.participant_id;
    const now = Date.now();
    const endAt = getSessionEndAt(session);
    const finishedSession = now > endAt;

    if (finishedSession && !participantId) {
      return res.status(410).json({ error: "시험이 종료되었습니다." });
    }
    if (!participantId) {
      participantId = nanoid();
      createParticipant({ participantId, sessionId, displayName: String(displayName).trim(), bojHandle, passwordHash });
      ensureProblemResults(sessionId, participantId, session.problemIds);
      emitEvent(sessionId, { type: "participant_joined", participantId, displayName });
    } else {
      if (exists.password_hash) {
        if (exists.password_hash !== passwordHash) {
          return res.status(403).json({ error: "비밀번호가 일치하지 않습니다." });
        }
      } else {
        setParticipantPassword(participantId, passwordHash);
      }
    }

    const started = session.startAt ? now >= session.startAt : true;
    res.json({
      participantId,
      sessionId,
      minutes: session.minutes,
      hideMeta: session.hideMeta,
      problemIds: session.problemIds,
      startAt: session.startAt,
      started,
      finished: !!exists?.finished_at,
      finishedAt: exists?.finished_at || null,
      ended: finishedSession,
      endAt,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/session/:id/finish", (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = getSession(sessionId);
    if (!session) return res.status(404).json({ error: "세션이 없습니다." });
    const { participantId } = req.body || {};
    if (!participantId) return res.status(400).json({ error: "participantId가 필요합니다." });
    const participant = getParticipantById(participantId);
    if (!participant || participant.session_id !== sessionId) {
      return res.status(400).json({ error: "참가자가 세션에 없습니다." });
    }
    markParticipantFinished(participantId);
    emitEvent(sessionId, { type: "participant_finished", participantId });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/session/:id/code", (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = getSession(sessionId);
    if (!session) return res.status(404).json({ error: "세션이 없습니다." });
    const { participantId, problemId, language, code } = req.body || {};
    if (!participantId || !problemId || !language) return res.status(400).json({ error: "필수 값이 누락되었습니다." });
    if (!session.problemIds.includes(Number(problemId))) return res.status(400).json({ error: "세션에 없는 문제입니다." });
    upsertParticipantCode({ participantId, problemId: Number(problemId), language: String(language), code: String(code || "") });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/participant/:id/codes", (req, res) => {
  try {
    const participantId = req.params.id;
    const codes = getParticipantCodes(participantId);
    res.json({ codes });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/session/:id/snapshot", (req, res) => {
  const sessionId = req.params.id;
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "세션이 없습니다." });

  const participants = listParticipants(sessionId);
  const results = getProblemResults(sessionId);

  res.json({
    session: {
      sessionId,
      minutes: session.minutes,
      hideMeta: session.hideMeta,
      problemIds: session.problemIds,
      startAt: session.startAt,
    },
    participants,
    results,
  });
});

app.get("/api/session/:id/problems", async (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = getSession(sessionId);
    if (!session) return res.status(404).json({ error: "세션이 없습니다." });
    const now = Date.now();
    const endAt = getSessionEndAt(session);
    if (now > endAt) {
      return res.status(410).json({ error: "시험이 종료되었습니다.", endAt });
    }
    if (session.startAt && Date.now() < session.startAt) {
      return res.status(403).json({ error: "아직 시작 시간이 아닙니다.", startAt: session.startAt });
    }

    const problems = await Promise.all(
      session.problemIds.map(async (pid) => {
        let payload = getProblemCache(pid);
        if (!payload) {
          payload = await fetchProblemPage(pid);
          setProblemCache(pid, payload);
        }
        return {
          id: pid,
          title: undefined,
          sectionsHtml: {
            descHtml: payload.descHtml,
            inputHtml: payload.inputHtml,
            outputHtml: payload.outputHtml,
          },
          samples: payload.samples,
        };
      })
    );

    res.json({ problems, hideMeta: true, minutes: session.minutes });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/session/:id/events", (req, res) => {
  const sessionId = req.params.id;
  const session = getSession(sessionId);
  if (!session) return res.status(404).end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write("retry: 1000\n\n");

  const unsubscribe = subscribe(sessionId, (event) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on("close", () => {
    unsubscribe();
  });
});

app.post("/api/run", async (req, res) => {
  const { sessionId, participantId, problemId, language, code, testcases, mode } = req.body || {};

  if (!sessionId || !participantId || !problemId || !language) {
    return res.status(400).json({ error: "필수 값이 누락되었습니다." });
  }

  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "세션이 없습니다." });
  const now = Date.now();
  const endAt = getSessionEndAt(session);
  if (now > endAt) {
    return res.status(410).json({ error: "시험이 종료되었습니다.", endAt });
  }

  const lastRun = lastRunByParticipant.get(participantId) || 0;
  if (now - lastRun < 2000) {
    return res.status(429).json({ error: "실행이 너무 자주 발생하고 있습니다. 잠시 후 다시 시도해주세요." });
  }
  lastRunByParticipant.set(participantId, now);

  if (!session.problemIds.includes(Number(problemId))) {
    return res.status(400).json({ error: "세션에 없는 문제입니다." });
  }

  if (!incSessionRun(sessionId)) {
    return res.status(429).json({ error: "동시 실행 제한에 도달했습니다. 잠시 후 다시 시도하세요." });
  }

  try {
    const cases = Array.isArray(testcases) ? testcases : [];
    if (!cases.length) return res.status(400).json({ error: "테스트케이스가 필요합니다." });

    const payload = await runCases({
      sessionId,
      participantId,
      problemId: Number(problemId),
      langId: String(language),
      code: String(code || ""),
      testcases: cases.map((c) => ({ input: String(c.input || ""), expected: c.expected != null ? String(c.expected) : null })),
    });

    const allSamplePass = payload.results.every((r) => r.pass === true) && payload.results.length > 0;
    const bestStatus = allSamplePass ? "all_sample_passed" : "partial";

    updateProblemResult({ participantId, problemId: Number(problemId), bestStatus });

    const stdout = payload.results.map((r) => r.stdout).join("\n\n").slice(0, CONFIG.maxStdoutBytes);
    const stderr = payload.results.map((r) => r.stderr).join("\n\n").slice(0, CONFIG.maxStderrBytes);

    insertRunLog({
      runId: payload.runId,
      participantId,
      problemId: Number(problemId),
      inputType: mode || "sample",
      stdout,
      stderr,
      exitCode: payload.results[0]?.exitCode ?? null,
      timedOut: payload.results.some((r) => r.timedOut),
    });
    trimRunLog(participantId);

    emitEvent(sessionId, {
      type: "run_finished",
      participantId,
      problemId: Number(problemId),
      bestStatus,
      attemptsDelta: 1,
      lastRunAt: Date.now(),
    });

    res.json({ perCaseResults: payload.results, runId: payload.runId });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    decSessionRun(sessionId);
  }
});

app.get("/api/participant/:id/logs", (req, res) => {
  const participantId = req.params.id;
  res.json({ logs: getRunLogs(participantId) });
});

const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (_, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

const expired = cleanupExpiredSessions();
if (expired > 0) {
  console.log(`expired sessions cleaned: ${expired}`);
}

setInterval(() => {
  const expired = cleanupExpiredSessions();
  if (expired > 0) {
    console.log(`expired sessions cleaned: ${expired}`);
  }
}, 30 * 60 * 1000);

app.listen(CONFIG.port, () => {
  console.log(`server listening on http://localhost:${CONFIG.port}`);
  console.log(`runner mode: ${CONFIG.runnerMode}`);
});
