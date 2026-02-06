import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import "./styles.css";

const api = {
  async post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "요청 실패");
    return data;
  },
  async get(path) {
    const res = await fetch(path);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "요청 실패");
    return data;
  },
};

function useCountdown(minutes, startAt) {
  const [leftMs, setLeftMs] = useState(minutes * 60 * 1000);
  const endRef = useRef(null);

  useEffect(() => {
    if (!minutes) return;
    const base = startAt ? Number(startAt) : Date.now();
    endRef.current = base + minutes * 60 * 1000;
    setLeftMs(Math.max(0, endRef.current - Date.now()));
    const t = setInterval(() => {
      const left = Math.max(0, endRef.current - Date.now());
      setLeftMs(left);
    }, 500);
    return () => clearInterval(t);
  }, [minutes, startAt]);

  const text = useMemo(() => {
    const t = Math.floor(leftMs / 1000);
    const h = String(Math.floor(t / 3600)).padStart(2, "0");
    const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
    const s = String(t % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }, [leftMs]);

  return { text, leftMs };
}

function App() {
  const [view, setView] = useState("home");
  const [homeStep, setHomeStep] = useState("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editorAssist, setEditorAssist] = useState(true);
  const errorRef = useRef(null);
  const [theme, setTheme] = useState("dark");

  const [sessionId, setSessionId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [minutes, setMinutes] = useState(0);
  const [hideMeta, setHideMeta] = useState(true);
  const [problems, setProblems] = useState([]);
  const [startAt, setStartAt] = useState(null);

  const [activeProblemId, setActiveProblemId] = useState(null);
  const [codeByPid, setCodeByPid] = useState({});
  const [language, setLanguage] = useState("py");
  const [runResultByPid, setRunResultByPid] = useState({});
  const [customCasesByPid, setCustomCasesByPid] = useState({});
  const [samplePassByPid, setSamplePassByPid] = useState({});
  const [rateLimitUntil, setRateLimitUntil] = useState(0);
  const editorRef = useRef(null);
  const editorWrapRef = useRef(null);
  const loadingNode = loading ? (
    <div className="loadingOverlay">
      <div className="loadingStack">
        <div className="bmtSpinner" aria-label="loading">
          <span>B</span>
          <span>M</span>
          <span>T</span>
        </div>
        <div className="loadingText">처리 중...</div>
      </div>
    </div>
  ) : null;

  const [snapshot, setSnapshot] = useState(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const dragRef = useRef(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const resultRef = useRef(null);

  const tiers = [
    { label: "Bronze 5", value: "b5" },
    { label: "Bronze 4", value: "b4" },
    { label: "Bronze 3", value: "b3" },
    { label: "Bronze 2", value: "b2" },
    { label: "Bronze 1", value: "b1" },
    { label: "Silver 5", value: "s5" },
    { label: "Silver 4", value: "s4" },
    { label: "Silver 3", value: "s3" },
    { label: "Silver 2", value: "s2" },
    { label: "Silver 1", value: "s1" },
    { label: "Gold 5", value: "g5" },
    { label: "Gold 4", value: "g4" },
    { label: "Gold 3", value: "g3" },
    { label: "Gold 2", value: "g2" },
    { label: "Gold 1", value: "g1" },
    { label: "Platinum 5", value: "p5" },
    { label: "Platinum 4", value: "p4" },
    { label: "Platinum 3", value: "p3" },
    { label: "Platinum 2", value: "p2" },
    { label: "Platinum 1", value: "p1" },
  ];

  const [soloHandles, setSoloHandles] = useState([""]);
  const [soloMinTierIdx, setSoloMinTierIdx] = useState(4);
  const [soloMaxTierIdx, setSoloMaxTierIdx] = useState(11);
  const [soloMinutes, setSoloMinutes] = useState(90);
  const [soloCount, setSoloCount] = useState(3);
  const [soloProblemMode, setSoloProblemMode] = useState("random");
  const [soloProblemIds, setSoloProblemIds] = useState([""]);

  const [multiHandles, setMultiHandles] = useState([""]);
  const [multiMinTierIdx, setMultiMinTierIdx] = useState(4);
  const [multiMaxTierIdx, setMultiMaxTierIdx] = useState(11);
  const [multiMinutes, setMultiMinutes] = useState(90);
  const [multiCount, setMultiCount] = useState(3);
  const [multiStartAt, setMultiStartAt] = useState("");
  const [multiProblemMode, setMultiProblemMode] = useState("random");
  const [multiProblemIds, setMultiProblemIds] = useState([""]);

  const [joinSessionId, setJoinSessionId] = useState("");
  const [joinDisplayName, setJoinDisplayName] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [createdUrl, setCreatedUrl] = useState("");

  const { text: timerText, leftMs: timerLeftMs } = useCountdown(minutes, startAt);
  const [savedAtByPid, setSavedAtByPid] = useState({});
  const [finishedPersonal, setFinishedPersonal] = useState(false);
  const [finishedPayload, setFinishedPayload] = useState(null);
  const [reviewPid, setReviewPid] = useState(null);
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [lobbyLeftMs, setLobbyLeftMs] = useState(0);

  function resetFinishState() {
    setFinishedPersonal(false);
    setFinishedPayload(null);
    setShowAnswerModal(false);
    setReviewPid(null);
  }

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const m = window.location.pathname.match(/\/session\/([A-Za-z0-9_-]+)/);
    if (m?.[1]) {
      setJoinSessionId(m[1]);
      setHomeStep("multi-join-realtime");
    }
  }, []);

  async function loadProblems(targetSessionId) {
    const data = await api.get(`/api/session/${targetSessionId}/problems`);
    setProblems(data.problems || []);
    setHideMeta(true);
    setMinutes(data.minutes || 0);
    setActiveProblemId(data.problems?.[0]?.id || null);
  }

  async function joinSession(targetSessionId, displayName, password) {
    const data = await api.post(`/api/session/${targetSessionId}/join`, { displayName, password });
    setSessionId(data.sessionId);
    setParticipantId(data.participantId);
    setMinutes(data.minutes);
    setHideMeta(true);
    setStartAt(data.startAt || null);
    const codes = await api.get(`/api/participant/${data.participantId}/codes`);
    if (codes?.codes?.length) {
      setCodeByPid((prev) => {
        const next = { ...prev };
        for (const c of codes.codes) next[c.problemId] = c.code || "";
        return next;
      });
      setSavedAtByPid((prev) => {
        const next = { ...prev };
        for (const c of codes.codes) {
          if (c.updatedAt) next[c.problemId] = c.updatedAt;
        }
        return next;
      });
    }

    if (data.finished || data.ended) {
      const problemList = data.problemIds?.map((id) => ({ id })) || [];
      setFinishedPayload({
        problems: problemList,
        codeByPid: codes?.codes?.reduce((acc, c) => {
          acc[c.problemId] = c.code || "";
          return acc;
        }, {}) || {},
        savedAtByPid: codes?.codes?.reduce((acc, c) => {
          if (c.updatedAt) acc[c.problemId] = c.updatedAt;
          return acc;
        }, {}) || {},
        language: "py",
        sampleScoreByPid: {},
      });
      setReviewPid(problemList?.[0]?.id || null);
      setShowAnswerModal(false);
      setFinishedPersonal(true);
    }
    return data;
  }

  function normalizedHandles(list) {
    const filtered = list.map((x) => x.trim()).filter(Boolean);
    return Array.from(new Set(filtered));
  }

  async function handleSoloSubmit() {
    setError("");
    resetFinishState();
    setLoading(true);
    try {
      const handles = normalizedHandles(soloHandles);
      if (soloProblemMode === "random" && !handles.length) throw new Error("BOJ 아이디를 1개 이상 입력하세요.");
      const problemIds = soloProblemMode === "manual"
        ? soloProblemIds
            .map((x) => Number(x))
            .filter((x) => Number.isFinite(x) && x > 0)
        : null;
      if (soloProblemMode === "manual" && (!problemIds || problemIds.length === 0)) {
        throw new Error("문제 번호를 1개 이상 입력하세요.");
      }
      const tier = {
        min: tiers[soloMinTierIdx].value,
        max: tiers[soloMaxTierIdx].value,
      };
      if (soloMinTierIdx > soloMaxTierIdx) throw new Error("문제 수준 범위를 확인하세요. (최소 <= 최대)");
      if (soloProblemMode === "random") {
        const v = await api.post("/api/handles/validate", { handles });
        if (v.invalid?.length) throw new Error(`없는 BOJ 아이디: ${v.invalid.join(", ")}`);
      }
      const body = {
        handles,
        minTier: tier.min,
        maxTier: tier.max,
        minutes: Number(soloMinutes),
        hideMeta: true,
        count: Number(soloCount),
        problemIds: problemIds && problemIds.length ? problemIds : undefined,
      };
      const data = await api.post("/api/session/solo", body);
      setSessionId(data.sessionId);
      setProblems(data.problems || []);
      setHideMeta(true);
      setMinutes(data.minutes || 0);
      setActiveProblemId(data.problems?.[0]?.id || null);

      const soloPass = crypto?.randomUUID?.() || String(Date.now());
      await joinSession(data.sessionId, "익명", soloPass);
      resetFinishState();
      setView("session");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGroupCreate() {
    setError("");
    resetFinishState();
    setLoading(true);
    try {
      const handles = normalizedHandles(multiHandles);
      if (multiProblemMode === "random" && !handles.length) throw new Error("BOJ 아이디를 1개 이상 입력하세요.");
      const problemIds = multiProblemMode === "manual"
        ? multiProblemIds
            .map((x) => Number(x))
            .filter((x) => Number.isFinite(x) && x > 0)
        : null;
      if (multiProblemMode === "manual" && (!problemIds || problemIds.length === 0)) {
        throw new Error("문제 번호를 1개 이상 입력하세요.");
      }
      const tier = {
        min: tiers[multiMinTierIdx].value,
        max: tiers[multiMaxTierIdx].value,
      };
      if (multiMinTierIdx > multiMaxTierIdx) throw new Error("문제 수준 범위를 확인하세요. (최소 <= 최대)");
      if (multiProblemMode === "random") {
        const v = await api.post("/api/handles/validate", { handles });
        if (v.invalid?.length) throw new Error(`없는 BOJ 아이디: ${v.invalid.join(", ")}`);
      }
      const body = {
        handles,
        minTier: tier.min,
        maxTier: tier.max,
        minutes: Number(multiMinutes),
        hideMeta: true,
        count: Number(multiCount),
        mode: "create",
        startAt: multiStartAt || null,
        problemIds: problemIds && problemIds.length ? problemIds : undefined,
      };
      const data = await api.post("/api/session/group", body);
      setSessionId(data.sessionId);

      const url = `${window.location.origin}/session/${data.sessionId}`;
      setCreatedUrl(url);
      setHomeStep("multi-created");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGroupJoinRoom() {
    setError("");
    resetFinishState();
    setLoading(true);
    try {
      const sid = String(joinSessionId || "").trim();
      if (!sid) throw new Error("세션 ID가 필요합니다.");

      if (!joinPassword.trim()) throw new Error("비밀번호가 필요합니다.");
      const jd = await joinSession(sid, String(joinDisplayName || "").trim(), String(joinPassword || "").trim());
      if (jd.finished || jd.ended) {
        setView("session");
        return;
      }
      if (jd.started) {
        await loadProblems(sid);
        resetFinishState();
        setView("session");
      } else {
        resetFinishState();
        setView("lobby");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // non-realtime join removed

  function getCurrentCode() {
    return codeByPid[activeProblemId] || "";
  }

  function getCurrentCustomCases() {
    return customCasesByPid[activeProblemId] || [];
  }

  function setCurrentCode(next) {
    if (!activeProblemId) return;
    setCodeByPid((prev) => ({ ...prev, [activeProblemId]: next }));
  }

  function getTemplate(lang) {
    if (lang === "py") {
      return `import sys

def main():
    data = sys.stdin.read().strip().split()
    # TODO: solve
    print("")

if __name__ == "__main__":
    main()
`;
    }
    if (lang === "js") {
      return `const fs = require("fs");

function main() {
  const input = fs.readFileSync(0, "utf8").trim().split(/\\s+/);
  // TODO: solve
  console.log("");
}

main();
`;
    }
    if (lang === "c") {
      return `#include <stdio.h>

int main(void) {
    // TODO: solve
    return 0;
}
`;
    }
    if (lang === "cpp") {
      return `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // TODO: solve
    return 0;
}
`;
    }
    if (lang === "java") {
      return `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st;
        // TODO: solve
    }
}
`;
    }
    if (lang === "kt") {
      return `import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.StringTokenizer

fun main() {
    val br = BufferedReader(InputStreamReader(System.\`in\`))
    // TODO: solve
}
`;
    }
    return "";
  }

  function isTemplateCode(code) {
    const trimmed = String(code || "").trim();
    if (!trimmed) return true;
    const candidates = ["py", "js", "c", "cpp", "java", "kt"].map((l) => getTemplate(l).trim());
    return candidates.includes(trimmed);
  }

  function setCurrentCustomCases(next) {
    if (!activeProblemId) return;
    setCustomCasesByPid((prev) => ({ ...prev, [activeProblemId]: next }));
  }

  useEffect(() => {
    if (!activeProblemId) return;
    const current = getCurrentCode();
    if (isTemplateCode(current)) {
      const tpl = getTemplate(language);
      if (tpl) setCurrentCode(tpl);
    }
  }, [language, activeProblemId]);

  async function saveCurrentCode() {
    if (!sessionId || !participantId || !activeProblemId) return;
    const code = getCurrentCode();
    await api.post(`/api/session/${sessionId}/code`, {
      participantId,
      problemId: activeProblemId,
      language,
      code,
    });
    setSavedAtByPid((prev) => ({ ...prev, [activeProblemId]: Date.now() }));
  }

  function downloadFile(name, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function leaveSession() {
    setSessionId("");
    setParticipantId("");
    setSnapshot(null);
    setProblems([]);
    setActiveProblemId(null);
    setRunResultByPid({});
    setCustomCasesByPid({});
    setStartAt(null);
    setMinutes(0);
    setShowParticipants(false);
  }

  function downloadSavedCodes(payload) {
    const ids = Object.keys(payload.savedAtByPid || {}).map((x) => Number(x));
    const target = ids.length ? ids : payload.problems.map((p) => p.id);
    target.forEach((pid) => {
      const code = payload.codeByPid[pid] || "";
      if (!code) return;
      const ext = payload.language === "py" ? "py" : "js";
      downloadFile(`boj_${pid}.${ext}`, code);
    });
  }

  async function finishMyExam({ autoDownload = false } = {}) {
    const sampleScoreByPid = {};
    for (const p of problems || []) {
      const total = p.samples?.length || 0;
      const map = samplePassByPid[p.id] || {};
      const passed = Object.values(map).filter((v) => v === true).length;
      sampleScoreByPid[p.id] = { total, passed };
    }
    const payload = {
      problems: problems || [],
      codeByPid: { ...codeByPid },
      savedAtByPid: { ...savedAtByPid },
      language,
      sampleScoreByPid,
    };
    setFinishedPayload(payload);
    setReviewPid(payload.problems?.[0]?.id || null);
    setShowAnswerModal(false);
    setFinishedPersonal(true);
    try {
      if (sessionId && participantId) {
        await api.post(`/api/session/${sessionId}/finish`, { participantId });
      }
    } catch {
      // ignore
    }
    leaveSession();
    if (autoDownload) {
      downloadSavedCodes(payload);
    }
  }

  async function runCasesWithMeta(testcases, meta) {
    if (!activeProblemId || !participantId || !sessionId) return;
    if (Date.now() < rateLimitUntil) {
      setError("실행이 너무 자주 발생하고 있습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = await api.post("/api/run", {
        sessionId,
        participantId,
        problemId: activeProblemId,
        language,
        code: getCurrentCode(),
        testcases,
        mode: "sample",
      });
      setRunResultByPid((prev) => ({ ...prev, [activeProblemId]: { ...payload, meta } }));
      const results = Array.isArray(payload?.results) ? payload.results : [];
      if (Array.isArray(meta) && meta.some((m) => m?.kind === "sample") && results.length) {
        setSamplePassByPid((prev) => {
          const next = { ...prev };
          const current = { ...(next[activeProblemId] || {}) };
          results.forEach((r, idx) => {
            const m = meta[idx];
            if (m?.kind === "sample" && typeof m.index === "number") {
              current[m.index] = r.pass === true;
            }
          });
          next[activeProblemId] = current;
          return next;
        });
      }
    } catch (e) {
      setError(e.message);
      if (String(e.message || "").includes("2초에 1회")) {
        setRateLimitUntil(Date.now() + 2000);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleRunSamples(samples) {
    const customCases = getCurrentCustomCases();
    const testcases = [
      ...samples.map((s) => ({ input: s.input, expected: s.output })),
      ...customCases.map((c) => ({ input: c.input, expected: c.output || null })),
    ];
    const meta = [
      ...samples.map((_, idx) => ({ kind: "sample", index: idx })),
      ...customCases.map((_, idx) => ({ kind: "custom", index: idx })),
    ];
    return runCasesWithMeta(testcases, meta);
  }

  function handleRunOneSample(sample, idx) {
    const testcases = [{ input: sample.input, expected: sample.output }];
    const meta = [{ kind: "sample", index: idx }];
    return runCasesWithMeta(testcases, meta);
  }

  function handleRunCustom(input, expected, idx = null) {
    const testcases = [{ input, expected: expected ? expected : null }];
    const meta = [{ kind: "custom", index: idx }];
    return runCasesWithMeta(testcases, meta);
  }

  function addCustomCase(input, output) {
    if (!input.trim()) return;
    const current = getCurrentCustomCases();
    setCurrentCustomCases([...current, { id: crypto.randomUUID(), input, output }]);
  }

  function removeCustomCase(id) {
    const current = getCurrentCustomCases();
    setCurrentCustomCases(current.filter((c) => c.id !== id));
  }

  useEffect(() => {
    if (!sessionId) return;
    let es;
    async function init() {
      try {
        const snap = await api.get(`/api/session/${sessionId}/snapshot`);
        setSnapshot(snap);
      } catch {
        // ignore
      }

      es = new EventSource(`/api/session/${sessionId}/events`);
      es.addEventListener("participant_joined", (ev) => {
        const data = JSON.parse(ev.data);
        if (!snapshot) {
          api.get(`/api/session/${sessionId}/snapshot`).then(setSnapshot).catch(() => {});
          return;
        }
        setSnapshot((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          next.participants = [...prev.participants, { participantId: data.participantId, displayName: data.displayName }];
          return next;
        });
      });
      es.addEventListener("run_finished", (ev) => {
        const data = JSON.parse(ev.data);
        setSnapshot((prev) => {
          if (!prev) return prev;
          const results = prev.results ? [...prev.results] : [];
          const idx = results.findIndex((r) => r.participantId === data.participantId && r.problemId === data.problemId);
          if (idx >= 0) {
            results[idx] = {
              ...results[idx],
              bestStatus: data.bestStatus,
              lastRunAt: data.lastRunAt,
              attemptsCount: (results[idx].attemptsCount || 0) + (data.attemptsDelta || 1),
            };
          } else {
            results.push({
              participantId: data.participantId,
              problemId: data.problemId,
              bestStatus: data.bestStatus,
              lastRunAt: data.lastRunAt,
              attemptsCount: data.attemptsDelta || 1,
            });
          }
          return { ...prev, results };
        });
      });
      es.addEventListener("participant_finished", (ev) => {
        const data = JSON.parse(ev.data);
        setSnapshot((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          next.participants = prev.participants.map((p) =>
            p.participantId === data.participantId ? { ...p, finishedAt: Date.now() } : p
          );
          return next;
        });
      });
    }

    init();
    return () => {
      if (es) es.close();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!showParticipants || !snapshot?.participants?.length) return;
    if (!selectedParticipantId) {
      setSelectedParticipantId(snapshot.participants[0].participantId);
    }
  }, [showParticipants, snapshot, selectedParticipantId]);

  useEffect(() => {
    const current = runResultByPid[activeProblemId];
    if (!current || !resultRef.current) return;
    resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [runResultByPid, activeProblemId]);

  useEffect(() => {
    if (view !== "session") return;
    if (timerLeftMs <= 0 && minutes > 0 && !finishedPersonal) {
      finishMyExam();
    }
  }, [timerLeftMs, minutes, finishedPersonal, view]);

  useEffect(() => {
    if (!startAt) return;
    const tick = () => {
      const left = Math.max(0, startAt - Date.now());
      setLobbyLeftMs(left);
      if (left === 0 && view === "lobby" && sessionId) {
        loadProblems(sessionId).then(() => setView("session")).catch(() => {});
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startAt, view, sessionId]);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => {
      setError("");
    }, 2000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current) return;
      e.preventDefault();
      const x = e.clientX;
      const total = window.innerWidth;
      const pct = Math.min(70, Math.max(30, (x / total) * 100));
      setSplitPercent(pct);
    }
    function onUp() {
      dragRef.current = false;
    }
    function preventSelect(e) {
      if (dragRef.current) e.preventDefault();
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("selectstart", preventSelect);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("selectstart", preventSelect);
    };
  }, []);

  useEffect(() => {
    function onResize() {
      setIsNarrow(window.innerWidth < 1200);
      if (editorRef.current) {
        editorRef.current.layout();
      }
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!editorWrapRef.current || !editorRef.current) return;
    const ro = new ResizeObserver(() => {
      editorRef.current?.layout();
    });
    ro.observe(editorWrapRef.current);
    return () => ro.disconnect();
  }, [view]);

  if (view === "home") {
    return (
      <div className="page">
        {loadingNode}
        <div className="homeShell">
          <div className="homePanel">
            <div className="homeHeader">
              <div>
                <div className="brand">BOJ Mock Test</div>
                <div className="sub">백준 모의 테스트</div>
              </div>
              <div className="themeToggle">
                  <button className="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                    {theme === "dark" ? "light" : "dark"}
                  </button>
              </div>
            </div>
            {homeStep === "choose" && (
              <>
                <h2>시작 모드 선택</h2>
                <div className="choiceGrid">
                  <div className="choiceCard">
                    <button className="choiceBtn" onClick={() => setHomeStep("solo")}>싱글 모드</button>
                    <div className="choiceDesc">혼자 풀기</div>
                  </div>
                  <div className="choiceCard">
                    <button className="choiceBtn" onClick={() => setHomeStep("multi")}>멀티 모드</button>
                    <div className="choiceDesc">여러명 같이 풀기</div>
                  </div>
                </div>
                <div className="homeLinkRow">
                  <div className="subtle">VSCode에서도 그대로 사용하고 싶다면</div>
                  <a
                    className="homeLink"
                    href="https://marketplace.visualstudio.com/items?itemName=gmyun1999.boj-mock-test"
                    target="_blank"
                    rel="noreferrer"
                  >
                    VSCode 확장 보기
                  </a>
                </div>
              </>
            )}

            {homeStep === "solo" && (
              <>
                <div className="cardHead">
                  <h2>싱글 모드</h2>
                </div>
                <div className="form sectioned">
                <div className="handleList">
                  <div className="fieldLabel">BOJ 아이디 <span className="fieldHintInline">- 입력한 아이디가 이미 푼 문제는 자동으로 제외됩니다.</span></div>
                  {soloHandles.map((h, idx) => (
                    <div key={idx} className="handleRow">
                    <input
                      value={h}
                      onChange={(e) => {
                        const next = [...soloHandles];
                        next[idx] = e.target.value;
                        setSoloHandles(next);
                      }}
                      placeholder={`아이디 ${idx + 1}`}
                    />
                    {soloHandles.length > 1 && (
                      <button className="iconDelete" onClick={() => setSoloHandles(soloHandles.filter((_, i) => i !== idx))}>삭제</button>
                    )}
                  </div>
                ))}
                <button className="ghost addBtn" onClick={() => setSoloHandles((prev) => [...prev, ""])}>+ 추가</button>
              </div>
              <div className="problemMode">
                <div className="fieldLabel">문제 선택</div>
                <div className="radioRow">
                  <label className="radio">
                    <input type="radio" checked={soloProblemMode === "random"} onChange={() => setSoloProblemMode("random")} />
                    랜덤
                  </label>
                  <label className="radio">
                    <input type="radio" checked={soloProblemMode === "manual"} onChange={() => setSoloProblemMode("manual")} />
                    백준 번호 지정
                  </label>
                </div>
                {soloProblemMode === "manual" && (
                  <div className="handleList">
                    <div className="fieldLabel">문제 번호</div>
                    {soloProblemIds.map((pid, idx) => (
                      <div key={idx} className="handleRow">
                        <input
                          value={pid}
                          onChange={(e) => {
                            const next = [...soloProblemIds];
                            next[idx] = e.target.value;
                            setSoloProblemIds(next);
                          }}
                          placeholder={`번호 ${idx + 1}`}
                        />
                        {soloProblemIds.length > 1 && (
                          <button className="iconDelete" onClick={() => setSoloProblemIds(soloProblemIds.filter((_, i) => i !== idx))}>삭제</button>
                        )}
                      </div>
                    ))}
                    <button className="ghost addBtn" onClick={() => setSoloProblemIds((prev) => [...prev, ""])}>+ 추가</button>
                  </div>
                )}
              </div>
              {soloProblemMode === "random" && (
                <div className="row">
                  <div className="tierBox">
                    <div className="fieldLabel">문제 수준 (최소 / 최대)</div>
                    <div className="tierRow">
                      <select value={soloMinTierIdx} onChange={(e) => setSoloMinTierIdx(Number(e.target.value))}>
                        {tiers.map((t, idx) => (
                          <option key={t.value} value={idx}>{t.label}</option>
                        ))}
                      </select>
                      <span className="tierSep">~</span>
                      <select value={soloMaxTierIdx} onChange={(e) => setSoloMaxTierIdx(Number(e.target.value))}>
                        {tiers.map((t, idx) => (
                          <option key={t.value} value={idx}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
              <div className="row">
                <div className="fieldGroup">
                  <div className="fieldLabel">시험 시간(분)</div>
                  <input type="number" value={soloMinutes} onChange={(e) => setSoloMinutes(Number(e.target.value))} placeholder="예: 90" />
                </div>
                {soloProblemMode === "random" ? (
                  <div className="fieldGroup">
                    <div className="fieldLabel">문제 수</div>
                    <input type="number" value={soloCount} onChange={(e) => setSoloCount(Number(e.target.value))} placeholder="예: 3" />
                  </div>
                ) : (
                  <div className="fieldGroup">
                    <div className="fieldLabel">문제 수</div>
                    <input type="number" value={soloProblemIds.filter((x) => String(x).trim()).length} readOnly />
                  </div>
                )}
              </div>
              <div className="settingsArea">
                <div className="fieldLabel">에디터 설정</div>
                <label className="checkbox">
                  <input type="checkbox" checked={editorAssist} onChange={(e) => setEditorAssist(e.target.checked)} />
                  자동완성 {editorAssist ? "ON" : "OFF"}
                </label>
              </div>
              <div className="actionRow">
                <button className="ghost" onClick={() => setHomeStep("choose")}>뒤로가기</button>
                <button disabled={loading} onClick={handleSoloSubmit}>시작</button>
              </div>
                </div>
              </>
            )}

            {homeStep === "multi" && (
              <>
                <div className="cardHead">
                  <h2>멀티 모드</h2>
                </div>
                <div className="choiceGrid">
                  <button className="choiceBtn" onClick={() => setHomeStep("multi-create")}>방 만들기</button>
                  <button className="choiceBtn" onClick={() => setHomeStep("multi-join")}>참여하기</button>
                </div>
                <div className="actionRow">
                  <button className="ghost" onClick={() => setHomeStep("choose")}>뒤로가기</button>
                  <div />
                </div>
              </>
            )}

            {homeStep === "multi-create" && (
              <>
                <div className="cardHead">
                  <h2>방 만들기</h2>
                </div>
                <div className="form sectioned">
                <div className="handleList">
                  <div className="fieldLabel">BOJ 아이디 <span className="fieldHintInline">- 입력한 아이디가 이미 푼 문제는 자동으로 제외됩니다.</span></div>
                  {multiHandles.map((h, idx) => (
                    <div key={idx} className="handleRow">
                    <input
                      value={h}
                      onChange={(e) => {
                        const next = [...multiHandles];
                        next[idx] = e.target.value;
                        setMultiHandles(next);
                      }}
                      placeholder={`아이디 ${idx + 1}`}
                    />
                    {multiHandles.length > 1 && (
                      <button className="iconDelete" onClick={() => setMultiHandles(multiHandles.filter((_, i) => i !== idx))}>삭제</button>
                    )}
                  </div>
                ))}
                <button className="ghost addBtn" onClick={() => setMultiHandles((prev) => [...prev, ""])}>+ 추가</button>
              </div>
              <div className="problemMode">
                <div className="fieldLabel">문제 선택</div>
                <div className="radioRow">
                  <label className="radio">
                    <input type="radio" checked={multiProblemMode === "random"} onChange={() => setMultiProblemMode("random")} />
                    랜덤
                  </label>
                  <label className="radio">
                    <input type="radio" checked={multiProblemMode === "manual"} onChange={() => setMultiProblemMode("manual")} />
                    백준 번호 지정
                  </label>
                </div>
                {multiProblemMode === "manual" && (
                  <div className="handleList">
                    <div className="fieldLabel">문제 번호</div>
                    {multiProblemIds.map((pid, idx) => (
                      <div key={idx} className="handleRow">
                        <input
                          value={pid}
                          onChange={(e) => {
                            const next = [...multiProblemIds];
                            next[idx] = e.target.value;
                            setMultiProblemIds(next);
                          }}
                          placeholder={`번호 ${idx + 1}`}
                        />
                        {multiProblemIds.length > 1 && (
                          <button className="iconDelete" onClick={() => setMultiProblemIds(multiProblemIds.filter((_, i) => i !== idx))}>삭제</button>
                        )}
                      </div>
                    ))}
                    <button className="ghost addBtn" onClick={() => setMultiProblemIds((prev) => [...prev, ""])}>+ 추가</button>
                  </div>
                )}
              </div>
              {multiProblemMode === "random" && (
                <div className="row">
                  <div className="tierBox">
                    <div className="fieldLabel">문제 수준 (최소 / 최대)</div>
                    <div className="tierRow">
                      <select value={multiMinTierIdx} onChange={(e) => setMultiMinTierIdx(Number(e.target.value))}>
                        {tiers.map((t, idx) => (
                          <option key={t.value} value={idx}>{t.label}</option>
                        ))}
                      </select>
                      <span className="tierSep">~</span>
                      <select value={multiMaxTierIdx} onChange={(e) => setMultiMaxTierIdx(Number(e.target.value))}>
                        {tiers.map((t, idx) => (
                          <option key={t.value} value={idx}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
              <div className="row">
                <div className="fieldGroup">
                  <div className="fieldLabel">시험 시간(분)</div>
                  <input type="number" value={multiMinutes} onChange={(e) => setMultiMinutes(Number(e.target.value))} placeholder="예: 90" />
                </div>
                {multiProblemMode === "random" ? (
                  <div className="fieldGroup">
                    <div className="fieldLabel">문제 수</div>
                    <input type="number" value={multiCount} onChange={(e) => setMultiCount(Number(e.target.value))} placeholder="예: 3" />
                  </div>
                ) : (
                  <div className="fieldGroup">
                    <div className="fieldLabel">문제 수</div>
                    <input type="number" value={multiProblemIds.filter((x) => String(x).trim()).length} readOnly />
                  </div>
                )}
              </div>
              <div className="row">
                <div className="fieldGroup">
                  <div className="fieldLabel">시작 시간</div>
                  <input
                    type="datetime-local"
                    value={multiStartAt}
                    onChange={(e) => setMultiStartAt(e.target.value)}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    onFocus={(e) => e.currentTarget.showPicker?.()}
                  />
                </div>
                <div />
              </div>
              <div className="settingsArea">
                <div className="fieldLabel">에디터 설정</div>
                <label className="checkbox">
                  <input type="checkbox" checked={editorAssist} onChange={(e) => setEditorAssist(e.target.checked)} />
                  자동완성 {editorAssist ? "ON" : "OFF"}
                </label>
              </div>
              <div className="actionRow">
                <button className="ghost" onClick={() => setHomeStep("multi")}>뒤로가기</button>
                <button disabled={loading} onClick={handleGroupCreate}>생성</button>
              </div>
            </div>
              </>
            )}

            {homeStep === "multi-created" && (
              <>
                <div className="cardHead">
                  <h2>방 생성 완료</h2>
                </div>
                <div className="homeStepHint">아래 URL을 공유해 참여자를 초대하세요.</div>
                <div className="inviteBox">
                  <div className="inviteLabel">참여 URL</div>
                  <div className="inviteRow">
                    <input readOnly value={createdUrl} />
                    <button
                      className="ghost"
                      onClick={async () => {
                        await navigator.clipboard.writeText(createdUrl);
                      }}
                    >
                      복사
                    </button>
                  </div>
                </div>
                <div className="inviteBox">
                  <div className="inviteLabel">세션 ID</div>
                  <div className="monoBox">{sessionId}</div>
                </div>
                <div className="actionRow">
                  <button className="ghost" onClick={() => setHomeStep("multi")}>닫기</button>
                  <button onClick={() => setHomeStep("multi-join")}>참여하기</button>
                </div>
              </>
            )}

            {homeStep === "multi-join" && (
              <>
                <div className="cardHead">
                  <h2>참여하기</h2>
                </div>
                <div className="choiceGrid">
                  <button className="choiceBtn" onClick={() => setHomeStep("multi-join-realtime")}>세션 URL로 참여하기</button>
                </div>
                <div className="hint">
                  멀티 모드는 동일한 세션 URL로 실시간 참여합니다.
                </div>
                <div className="actionRow">
                  <button className="ghost" onClick={() => setHomeStep("multi")}>뒤로가기</button>
                  <div />
                </div>
              </>
            )}

            {homeStep === "multi-join-realtime" && (
              <>
                <div className="cardHead">
                  <h2>실시간 참여</h2>
                </div>
                <div className="form sectioned">
              <div className="fieldHint">닉네임은 세션 내에서 보여지고, 비밀번호는 재접속 시 본인 확인용으로 사용됩니다.</div>
              <input
                value={joinSessionId}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const m = v.match(/\/session\/([A-Za-z0-9_-]+)/);
                  setJoinSessionId(m?.[1] || v);
                }}
                placeholder="세션 URL 또는 ID"
              />
              <input value={joinDisplayName} onChange={(e) => setJoinDisplayName(e.target.value)} placeholder="닉네임" />
              <input type="password" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} placeholder="비밀번호" />
              <div className="settingsArea">
                <div className="fieldLabel">에디터 설정</div>
                <label className="checkbox">
                  <input type="checkbox" checked={editorAssist} onChange={(e) => setEditorAssist(e.target.checked)} />
                  자동완성 {editorAssist ? "ON" : "OFF"}
                </label>
              </div>
              <div className="actionRow">
                <button className="ghost" onClick={() => setHomeStep("multi-join")}>뒤로가기</button>
                <button disabled={loading} onClick={handleGroupJoinRoom}>참여</button>
              </div>
                </div>
              </>
            )}

            {/* non-realtime join removed */}
          </div>
        </div>

        {error && <div className="error" ref={errorRef}>{error}</div>}
      </div>
    );
  }

  if (view === "lobby") {
    const leftSec = Math.max(0, Math.floor(lobbyLeftMs / 1000));
    const mm = String(Math.floor(leftSec / 60)).padStart(2, "0");
    const ss = String(leftSec % 60).padStart(2, "0");
    const startText = startAt ? new Date(startAt).toLocaleString() : "-";
    const shareUrl = `${window.location.origin}/session/${sessionId}`;
    return (
      <div className="page">
        {loadingNode}
        <div className="homeShell">
          <div className="homePanel">
            <div className="homeHeader">
              <div>
                <div className="brand">BOJ Mock Test</div>
                <div className="sub">대기방</div>
              </div>
              <div className="themeToggle">
                <button className="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                  {theme === "dark" ? "light" : "dark"}
                </button>
              </div>
            </div>
            <div className="lobbyInfo">
              <div className="fieldLabel">참여 URL</div>
              <div className="inviteRow">
                <input readOnly value={shareUrl} />
                <button
                  className="ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareUrl);
                  }}
                >
                  복사
                </button>
              </div>
              <div className="fieldLabel">세션 ID</div>
              <div className="monoBox">{sessionId}</div>
              <div className="fieldLabel">시작 시간</div>
              <div className="monoBox">{startText}</div>
              <div className="fieldLabel">시작까지 남은 시간</div>
              <div className="countdown">{mm}:{ss}</div>
            </div>
            <div className="fieldLabel">참여자</div>
            {snapshot ? (
              <div className="participantList">
                {snapshot.participants.map((p) => (
                  <div key={p.participantId} className="participantItem">{p.displayName}</div>
                ))}
              </div>
            ) : (
              <div className="muted">불러오는 중...</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const activeProblem = problems.find((p) => p.id === activeProblemId);
  const runResult = activeProblemId ? runResultByPid[activeProblemId] : null;
  const customCases = getCurrentCustomCases();
  const currentCode = getCurrentCode();
  const selectedParticipant = snapshot?.participants?.find((p) => p.participantId === selectedParticipantId) || null;
  const rateLimitLeftMs = Math.max(0, rateLimitUntil - Date.now());

  if (finishedPersonal) {
    const payload = finishedPayload || { problems: [], codeByPid: {}, savedAtByPid: {}, language, sampleScoreByPid: {} };
    const reviewProblem = payload.problems.find((p) => p.id === reviewPid) || null;
    const reviewCode = reviewProblem ? (payload.codeByPid[reviewProblem.id] || "") : "";
    return (
      <div className="page">
        {loadingNode}
        <div className={`finishedShell ${showAnswerModal ? "open" : ""}`}>
          <div className={`finishedLeft ${showAnswerModal ? "withPanel" : ""}`}>
            <div className="homeHeader">
              <div>
                <div className="brand">BOJ Mock Test</div>
                <div className="sub">시험 종료</div>
              </div>
              <div className="themeToggle">
                <button className="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                  {theme === "dark" ? "light" : "dark"}
                </button>
              </div>
            </div>
            <div className="form sectioned">
              <div className="sectionTitle">제출 링크</div>
              {(payload.problems || []).map((p, idx) => (
                <div key={p.id} className="linkGroup">
                  <div className="fieldLabel">
                    문제 {idx + 1}
                    <span className="muted">
                      {" · "}
                      {payload.sampleScoreByPid?.[p.id]?.total
                        ? `테스트 케이스 ${payload.sampleScoreByPid[p.id].total}개`
                        : "테스트 케이스 없음"}
                    </span>
                    {payload.sampleScoreByPid?.[p.id]?.total ? (
                      <span className="scoreMeta">
                        <span className="scoreBadge">{payload.sampleScoreByPid[p.id].passed}솔</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="linkRow">
                    <a className="primaryBtn" href={`https://www.acmicpc.net/problem/${p.id}`} target="_blank" rel="noreferrer">
                      문제 보기
                    </a>
                    <a className="primaryBtn" href={`https://www.acmicpc.net/submit/${p.id}`} target="_blank" rel="noreferrer">
                      제출하기
                    </a>
                    <button className="primaryBtn" onClick={() => { setReviewPid(p.id); setShowAnswerModal(true); }}>
                      내 답안 보기
                    </button>
                  </div>
                </div>
              ))}
              <div className="actionRow single">
                <button className="ghost" onClick={() => { setView("home"); setFinishedPersonal(false); setFinishedPayload(null); setShowAnswerModal(false); setReviewPid(null); }}>홈으로</button>
              </div>
            </div>
          </div>
          <div className={`finishedRight ${showAnswerModal ? "open" : ""}`}>
            <div className="answerPanel">
              <div className="answerModalHead">
                <div className="sectionTitle">제출 답안</div>
                <button className="ghost" onClick={() => setShowAnswerModal(false)}>닫기</button>
              </div>
              {reviewProblem ? (
                <>
                  <div className="answerHead">
                    <div className="fieldLabel">문제 {payload.problems.findIndex((p) => p.id === reviewProblem.id) + 1}</div>
                    <button
                      className="primaryBtn"
                      onClick={async () => {
                        await navigator.clipboard.writeText(reviewCode || "");
                      }}
                      disabled={!reviewCode}
                    >
                      복사
                    </button>
                  </div>
                  <pre className="answerBox">{reviewCode || "저장된 코드가 없습니다."}</pre>
                </>
              ) : (
                <div className="muted">문제를 선택하세요.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="session">
      {loadingNode}
      <aside className="sideMini">
        <div className="list mini">
          {problems.map((p, idx) => (
            <button
              key={p.id}
              className={p.id === activeProblemId ? "active" : ""}
              onClick={() => setActiveProblemId(p.id)}
              title={`문제 ${idx + 1}`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      </aside>

      <main className="mainShell">
        <div className="topBar">
          <div className="timerInline">
            <span>남은 시간</span>
            <strong>{timerText}</strong>
          </div>
          <div className="topActions">
            <button className="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? "light" : "dark"}
            </button>
            <button className="ghost" onClick={() => setShowParticipants(true)}>참가자 현황</button>
            <button
              className="finishBtn"
              onClick={() => {
                const ok = window.confirm("저장하지 않은 코드는 사라질 수 있습니다. 저장했는지 확인했나요?");
                if (ok) finishMyExam({ autoDownload: true });
              }}
            >
              시험 종료
            </button>
          </div>
        </div>
        <div
          className="contentSplit"
          style={isNarrow ? undefined : { gridTemplateColumns: `${splitPercent}% 10px ${100 - splitPercent}%` }}
        >
          <div className="leftCol">
          <section className="problem">
          <div className="header">
            <div className="title" />
          </div>

          {activeProblem ? (
            <div className="sections">
              <div className="section">
                <h3 className="blueTitle">문제</h3>
                <div className="html" dangerouslySetInnerHTML={{ __html: activeProblem.sectionsHtml.descHtml }} />
              </div>
              <div className="section">
                <h3 className="blueTitle">입력</h3>
                <div className="html" dangerouslySetInnerHTML={{ __html: activeProblem.sectionsHtml.inputHtml }} />
              </div>
              <div className="section">
                <h3 className="blueTitle">출력</h3>
                <div className="html" dangerouslySetInnerHTML={{ __html: activeProblem.sectionsHtml.outputHtml }} />
              </div>
              <div className="section">
                <div className="samplesHeader">
                  <h3 className="blueTitle">예제</h3>
                  {rateLimitLeftMs > 0 && (
                    <div className="muted">쿨다운 {Math.ceil(rateLimitLeftMs / 1000)}s</div>
                  )}
                  <button
                    className="iconPlay"
                    onClick={() => handleRunSamples(activeProblem.samples)}
                    disabled={loading || rateLimitLeftMs > 0}
                    title="전체 실행"
                  >
                    ▶
                  </button>
                </div>
                <div className="samples">
                  {activeProblem.samples.map((s, idx) => (
                    <div key={idx} className="sample">
                      <div className="sampleTop">
                        <div className="label">예제 {idx + 1}</div>
                        <button
                          className="iconPlay"
                          onClick={() => handleRunOneSample(s, idx)}
                          disabled={loading || rateLimitLeftMs > 0}
                          title="예제 실행"
                        >
                          ▶
                        </button>
                      </div>
                      <div className="ioGrid">
                        <div>
                          <div className="ioLabel">입력</div>
                          <pre className="ioBox">{s.input}</pre>
                        </div>
                        <div>
                          <div className="ioLabel">출력</div>
                          <pre className="ioBox">{s.output}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {customCases.length > 0 && (
                  <div className="samples">
                    {customCases.map((c, idx) => (
                      <div key={c.id} className="sample">
                        <div className="sampleTop">
                          <div className="label">예제 {activeProblem.samples.length + idx + 1}</div>
                          <div className="sampleActions">
                            <button
                              className="iconPlay"
                              onClick={() => handleRunCustom(c.input, c.output, idx)}
                              disabled={loading || rateLimitLeftMs > 0}
                              title="예제 실행"
                            >
                              ▶
                            </button>
                            <button
                              className="iconDelete"
                              onClick={() => removeCustomCase(c.id)}
                              disabled={loading}
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                        <div className="ioGrid">
                          <div>
                            <div className="ioLabel">입력</div>
                            <pre className="ioBox">{c.input}</pre>
                          </div>
                          <div>
                            <div className="ioLabel">출력</div>
                            <pre className="ioBox">{c.output || "(출력 미입력)"}</pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="section">
                <h3 className="blueTitle">예제 추가</h3>
                <div className="ioGrid">
                  <div>
                    <div className="ioLabel">입력</div>
                    <textarea className="ioTextarea" id="customInput" placeholder="입력을 붙여넣어주세요" />
                  </div>
                  <div>
                    <div className="ioLabel">출력 (선택)</div>
                    <textarea className="ioTextarea" id="customExpected" placeholder="기대 출력을 입력하면 PASS/FAIL로 채점합니다" />
                  </div>
                </div>
                <div className="addRow">
                  <button
                    onClick={() => {
                      const input = document.getElementById("customInput").value;
                      const expected = document.getElementById("customExpected").value;
                      addCustomCase(input, expected);
                      document.getElementById("customInput").value = "";
                      document.getElementById("customExpected").value = "";
                    }}
                    disabled={loading}
                  >
                    추가
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="muted">문제를 선택하세요.</div>
          )}
        </section>

          <section className="result" ref={resultRef}>
            <h3 className="blueTitle">실행 결과</h3>
            {runResult ? (
              <div className="results">
              {runResult.perCaseResults.map((r, idx) => {
                const meta = runResult.meta?.[idx];
                const label =
                  meta?.kind === "sample"
                    ? `예제 ${meta.index + 1}`
                    : meta?.kind === "custom"
                      ? `예제 ${activeProblem.samples.length + (meta.index ?? 0) + 1}`
                      : `케이스 ${idx + 1}`;
                return (
                  <div key={idx} className="resultRow">
                    <div className="resultTop">
                      <div className="label">{label}</div>
                      <div className={`badge ${r.pass === true ? "ok" : r.pass === false ? "fail" : "neutral"}`}>
                        {r.pass === null ? "EXEC" : r.pass ? "PASS" : "FAIL"}
                      </div>
                      {(r.pass === false || r.pass === null) && (
                          <button
                            className="iconPlay"
                            onClick={() => {
                              if (meta?.kind === "sample") {
                                const s = activeProblem.samples[meta.index];
                                if (s) handleRunOneSample(s, meta.index);
                              } else if (meta?.kind === "custom") {
                                const c = customCases[meta.index];
                                if (c) handleRunCustom(c.input, c.output, meta.index);
                              }
                            }}
                            disabled={loading || rateLimitLeftMs > 0}
                            title="다시 실행"
                          >
                            ▶
                          </button>
                      )}
                    </div>
                    {r.pass === false && r.expected != null ? (
                      <div className="ioGrid">
                        <div>
                          <div className="ioLabel">기대</div>
                          <pre className="ioBox">{r.expected}</pre>
                        </div>
                        <div>
                          <div className="ioLabel">출력</div>
                          <pre className="ioBox">{r.stdout || ""}</pre>
                        </div>
                      </div>
                    ) : (
                      <pre className="ioBox">{r.stdout || ""}</pre>
                    )}
                    {r.stderr && <pre className="stderr">{r.stderr}</pre>}
                    {r.timedOut && <div className="warn">시간 초과</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="muted">아직 실행 결과가 없습니다.</div>
          )}
        </section>

        {error && <div className="error" ref={errorRef}>{error}</div>}
          </div>

          <div
            className="splitter"
            title="좌우 크기 조절"
            onMouseDown={() => {
              dragRef.current = true;
            }}
          >
            <div className="splitterHandle" />
          </div>

          <div className="rightCol">
            <section className="editor">
              <div className="editorHead">
                <h3 className="blueTitle">코드</h3>
                <div className="editorTools">
                  <select className="langSelect" value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="py">Python</option>
                    <option value="js">JavaScript</option>
                    <option value="c">C</option>
                    <option value="cpp">C++</option>
                    <option value="java">Java</option>
                    <option value="kt">Kotlin</option>
                  </select>
                  <button className="saveBtn" onClick={saveCurrentCode}>현재 문제 저장</button>
                </div>
              </div>
              <div className="editorActions">
                {savedAtByPid[activeProblemId] && (
                  <div className="muted">저장됨</div>
                )}
              </div>
              <div className="editorWrap" ref={editorWrapRef}>
                <Editor
                  height="100%"
                  defaultLanguage="python"
                  language={
                    language === "py"
                      ? "python"
                      : language === "js"
                        ? "javascript"
                        : language === "cpp"
                          ? "cpp"
                          : language === "c"
                            ? "c"
                            : language === "java"
                              ? "java"
                              : language === "kt"
                                ? "kotlin"
                                : "plaintext"
                  }
                  theme="boj-dark"
                  value={currentCode}
                  onChange={(v) => setCurrentCode(v ?? "")}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: "on",
                    tabSize: 4,
                    insertSpaces: true,
                    automaticLayout: true,
                    padding: { top: 30, bottom: 10 },
                    quickSuggestions: editorAssist,
                    suggestOnTriggerCharacters: editorAssist,
                    parameterHints: { enabled: editorAssist },
                    inlineSuggest: { enabled: editorAssist },
                  }}
                  onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    monaco.editor.defineTheme("boj-dark", {
                      base: "vs-dark",
                      inherit: true,
                      rules: [],
                      colors: {
                        "editor.background": "#1e1e1e",
                        "editorLineNumber.foreground": "#5a5a5a",
                        "editorLineNumber.activeForeground": "#9b9b9b",
                        "editorGutter.background": "#1e1e1e",
                      },
                    });
                    monaco.editor.setTheme("boj-dark");
                  }}
                />
              </div>
            </section>
          </div>
        </div>
      </main>

      {showParticipants && (
        <div className="modalBack" onClick={() => setShowParticipants(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <h3>참가자 현황</h3>
              <button className="ghost" onClick={() => setShowParticipants(false)}>닫기</button>
            </div>
            {snapshot ? (
              <div className="modalBody">
                <div className="participantList">
                  {snapshot.participants.map((p) => (
                    <button
                      key={p.participantId}
                      className={p.participantId === selectedParticipantId ? "active" : ""}
                      onClick={() => setSelectedParticipantId(p.participantId)}
                    >
                      {p.displayName}
                    </button>
                  ))}
                </div>
                <div className="participantDetail">
                  {selectedParticipant ? (
                    <>
                      <div className="detailName">{selectedParticipant.displayName}</div>
                      <div className="matrix">
                        {snapshot.session.problemIds.map((pid, idx) => {
                          const r = snapshot.results.find((x) => x.participantId === selectedParticipant.participantId && x.problemId === pid);
                          const finished = !!selectedParticipant.finishedAt;
                          const status = r?.bestStatus === "all_sample_passed"
                            ? "PASS"
                            : finished
                              ? "SUBMIT"
                              : r
                                ? "TRY"
                                : "-";
                          return (
                            <div key={pid} className="detailRow">
                              <div>문제 {idx + 1}</div>
                              <div className={`status ${status}`}>{status}</div>
                              <div className="muted">시도 {r?.attemptsCount || 0}</div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="muted">참가자를 선택하세요.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="muted">불러오는 중...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
