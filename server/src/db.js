import Database from "better-sqlite3";
import { CONFIG } from "./config.js";

const db = new Database(CONFIG.dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS session (
  session_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  minutes INTEGER NOT NULL,
  hide_meta INTEGER NOT NULL,
  problem_ids TEXT NOT NULL,
  start_at INTEGER
);

CREATE TABLE IF NOT EXISTS participant (
  participant_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  boj_handle TEXT,
  joined_at INTEGER NOT NULL,
  finished_at INTEGER,
  password_hash TEXT,
  UNIQUE(session_id, display_name)
);

CREATE TABLE IF NOT EXISTS problem_result (
  session_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  problem_id INTEGER NOT NULL,
  attempts_count INTEGER NOT NULL DEFAULT 0,
  last_run_at INTEGER,
  best_status TEXT,
  total_time_spent INTEGER,
  PRIMARY KEY (participant_id, problem_id)
);

CREATE TABLE IF NOT EXISTS run_log (
  run_id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  problem_id INTEGER NOT NULL,
  input_type TEXT NOT NULL,
  stdout TEXT,
  stderr TEXT,
  exit_code INTEGER,
  timed_out INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS participant_code (
  participant_id TEXT NOT NULL,
  problem_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (participant_id, problem_id)
);
`);

try {
  db.exec("ALTER TABLE session ADD COLUMN start_at INTEGER");
} catch {
  // ignore if exists
}

try {
  db.exec("ALTER TABLE participant_code ADD COLUMN updated_at INTEGER");
} catch {
  // ignore if exists
}

try {
  db.exec("ALTER TABLE participant ADD COLUMN finished_at INTEGER");
} catch {
  // ignore if exists
}

try {
  db.exec("ALTER TABLE participant ADD COLUMN password_hash TEXT");
} catch {
  // ignore if exists
}

export function getDb() {
  return db;
}

export function cleanupExpiredSessions() {
  const now = Date.now();
  const ttlMs = CONFIG.sessionTtlHours * 60 * 60 * 1000;
  // Expire based on start_at if provided; otherwise created_at.
  // Also include session duration so future-start sessions aren't deleted early.
  const expired = db.prepare(
    "SELECT session_id FROM session WHERE (COALESCE(start_at, created_at) + (minutes * 60 * 1000) + ?) < ?"
  ).all(ttlMs, now);
  if (!expired.length) return 0;

  const ids = expired.map((x) => x.session_id);
  const inClause = ids.map(() => "?").join(",");

  db.prepare(`DELETE FROM problem_result WHERE session_id IN (${inClause})`).run(...ids);
  db.prepare(`DELETE FROM participant WHERE session_id IN (${inClause})`).run(...ids);
  db.prepare(`DELETE FROM session WHERE session_id IN (${inClause})`).run(...ids);

  return ids.length;
}

export function createSession({ sessionId, minutes, hideMeta, problemIds, startAt }) {
  const stmt = db.prepare(
    "INSERT INTO session (session_id, created_at, minutes, hide_meta, problem_ids, start_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  stmt.run(sessionId, Date.now(), minutes, hideMeta ? 1 : 0, JSON.stringify(problemIds), startAt ?? null);
}

export function getSession(sessionId) {
  const row = db.prepare("SELECT * FROM session WHERE session_id = ?").get(sessionId);
  if (!row) return null;
  return {
    sessionId: row.session_id,
    createdAt: row.created_at,
    minutes: row.minutes,
    hideMeta: !!row.hide_meta,
    problemIds: JSON.parse(row.problem_ids),
    startAt: row.start_at,
  };
}

export function createParticipant({ participantId, sessionId, displayName, bojHandle, passwordHash }) {
  const stmt = db.prepare(
    "INSERT INTO participant (participant_id, session_id, display_name, boj_handle, joined_at, password_hash) VALUES (?, ?, ?, ?, ?, ?)"
  );
  stmt.run(participantId, sessionId, displayName, bojHandle || null, Date.now(), passwordHash || null);
}

export function listParticipants(sessionId) {
  return db
    .prepare("SELECT participant_id, display_name, boj_handle, joined_at, finished_at FROM participant WHERE session_id = ? ORDER BY joined_at ASC")
    .all(sessionId)
    .map((row) => ({
      participantId: row.participant_id,
      displayName: row.display_name,
      bojHandle: row.boj_handle,
      joinedAt: row.joined_at,
      finishedAt: row.finished_at,
    }));
}

export function getParticipantByName(sessionId, displayName) {
  return db
    .prepare("SELECT participant_id, finished_at, password_hash FROM participant WHERE session_id = ? AND display_name = ?")
    .get(sessionId, displayName);
}

export function getParticipantById(participantId) {
  return db
    .prepare("SELECT participant_id, session_id, display_name, finished_at, password_hash FROM participant WHERE participant_id = ?")
    .get(participantId);
}

export function setParticipantPassword(participantId, passwordHash) {
  db.prepare("UPDATE participant SET password_hash = ? WHERE participant_id = ?").run(passwordHash, participantId);
}

export function markParticipantFinished(participantId) {
  db.prepare("UPDATE participant SET finished_at = ? WHERE participant_id = ?").run(Date.now(), participantId);
}

export function ensureProblemResults(sessionId, participantId, problemIds) {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO problem_result (session_id, participant_id, problem_id, attempts_count, last_run_at, best_status, total_time_spent) VALUES (?, ?, ?, 0, NULL, NULL, NULL)"
  );

  const tx = db.transaction(() => {
    for (const pid of problemIds) stmt.run(sessionId, participantId, pid);
  });
  tx();
}

export function updateProblemResult({ participantId, problemId, bestStatus }) {
  const stmt = db.prepare(
    "UPDATE problem_result SET attempts_count = attempts_count + 1, last_run_at = ?, best_status = ? WHERE participant_id = ? AND problem_id = ?"
  );
  stmt.run(Date.now(), bestStatus || null, participantId, problemId);
}

export function insertRunLog({ runId, participantId, problemId, inputType, stdout, stderr, exitCode, timedOut }) {
  const stmt = db.prepare(
    "INSERT INTO run_log (run_id, participant_id, problem_id, input_type, stdout, stderr, exit_code, timed_out, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  stmt.run(runId, participantId, problemId, inputType, stdout, stderr, exitCode, timedOut ? 1 : 0, Date.now());
}

export function trimRunLog(participantId) {
  const rows = db
    .prepare("SELECT run_id FROM run_log WHERE participant_id = ? ORDER BY created_at DESC")
    .all(participantId);
  if (rows.length <= CONFIG.maxRunLogPerParticipant) return;

  const toDelete = rows.slice(CONFIG.maxRunLogPerParticipant).map((r) => r.run_id);
  const inClause = toDelete.map(() => "?").join(",");
  db.prepare(`DELETE FROM run_log WHERE run_id IN (${inClause})`).run(...toDelete);
}

export function getRunLogs(participantId) {
  return db
    .prepare("SELECT * FROM run_log WHERE participant_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(participantId, CONFIG.maxRunLogPerParticipant)
    .map((r) => ({
      runId: r.run_id,
      participantId: r.participant_id,
      problemId: r.problem_id,
      inputType: r.input_type,
      stdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.exit_code,
      timedOut: !!r.timed_out,
      createdAt: r.created_at,
    }));
}

export function getProblemResults(sessionId) {
  return db
    .prepare("SELECT participant_id, problem_id, attempts_count, last_run_at, best_status, total_time_spent FROM problem_result WHERE session_id = ?")
    .all(sessionId)
    .map((r) => ({
      participantId: r.participant_id,
      problemId: r.problem_id,
      attemptsCount: r.attempts_count,
      lastRunAt: r.last_run_at,
      bestStatus: r.best_status,
      totalTimeSpent: r.total_time_spent,
    }));
}

export function upsertParticipantCode({ participantId, problemId, language, code }) {
  const stmt = db.prepare(
    "INSERT INTO participant_code (participant_id, problem_id, language, code, updated_at) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(participant_id, problem_id) DO UPDATE SET language = excluded.language, code = excluded.code, updated_at = excluded.updated_at"
  );
  stmt.run(participantId, problemId, language, code, Date.now());
}

export function getParticipantCodes(participantId) {
  return db
    .prepare("SELECT problem_id, language, code, updated_at FROM participant_code WHERE participant_id = ?")
    .all(participantId)
    .map((r) => ({
      problemId: r.problem_id,
      language: r.language,
      code: r.code,
      updatedAt: r.updated_at,
    }));
}
