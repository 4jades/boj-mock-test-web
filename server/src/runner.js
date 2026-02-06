import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { CONFIG } from "./config.js";
import { nanoid } from "nanoid";

const LANGS = {
  py: {
    id: "py",
    label: "Python",
    filename: "main.py",
    runCmd: () => ({ cmd: "python3", args: ["main.py"] }),
    dockerContainer: CONFIG.dockerPythonContainer,
  },
  js: {
    id: "js",
    label: "JavaScript",
    filename: "main.js",
    runCmd: () => ({ cmd: "node", args: ["main.js"] }),
    dockerContainer: CONFIG.dockerNodeContainer,
  },
  c: {
    id: "c",
    label: "C",
    filename: "main.c",
    compileCmd: () => ({ cmd: "gcc", args: ["-O2", "-std=c11", "main.c", "-o", "main"] }),
    runCmd: () => ({ cmd: "./main", args: [] }),
    dockerContainer: CONFIG.dockerCContainer,
  },
  cpp: {
    id: "cpp",
    label: "C++",
    filename: "main.cpp",
    compileCmd: () => ({ cmd: "g++", args: ["-O2", "-std=gnu++20", "main.cpp", "-o", "main"] }),
    runCmd: () => ({ cmd: "./main", args: [] }),
    dockerContainer: CONFIG.dockerCppContainer,
  },
  java: {
    id: "java",
    label: "Java",
    filename: "Main.java",
    compileCmd: () => ({ cmd: "javac", args: ["Main.java"] }),
    runCmd: () => ({ cmd: "java", args: ["Main"] }),
    dockerContainer: CONFIG.dockerJavaContainer,
  },
  kt: {
    id: "kt",
    label: "Kotlin",
    filename: "Main.kt",
    compileCmd: () => ({ cmd: "kotlinc", args: ["Main.kt", "-include-runtime", "-d", "main.jar"] }),
    runCmd: () => ({ cmd: "java", args: ["-jar", "main.jar"] }),
    dockerContainer: CONFIG.dockerKotlinContainer,
  },
};

export function getLang(langId) {
  return LANGS[langId] || null;
}

function normOut(s) {
  return String(s || "").replace(/\r\n/g, "\n").trimEnd();
}

function limitAppend(current, chunk, maxBytes) {
  if (current.length >= maxBytes) return current;
  const remaining = maxBytes - current.length;
  return current + chunk.slice(0, remaining);
}

async function runCmd({ cmd, args, cwd, stdin, timeoutMs }) {
  return await new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let done = false;

    const t = setTimeout(() => {
      if (done) return;
      done = true;
      try {
        p.kill("SIGKILL");
      } catch {
        // ignore
      }
      resolve({ code: null, stdout, stderr, timedOut: true });
    }, timeoutMs);

    p.stdout.on("data", (d) => {
      stdout = limitAppend(stdout, d.toString(), CONFIG.maxStdoutBytes);
    });
    p.stderr.on("data", (d) => {
      stderr = limitAppend(stderr, d.toString(), CONFIG.maxStderrBytes);
    });

    p.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve({ code, stdout, stderr, timedOut: false });
    });

    p.stdin.write(stdin || "");
    p.stdin.end();
  });
}

async function compileLocal({ workDir, lang }) {
  if (!lang.compileCmd) return;
  const { cmd, args } = lang.compileCmd();
  const result = await runCmd({ cmd, args, cwd: workDir, stdin: "", timeoutMs: CONFIG.compileTimeoutMs });
  if (result.timedOut || result.code !== 0) {
    throw new Error(`컴파일 실패\n${result.stderr || result.stdout}`);
  }
}

async function runLocal({ workDir, lang, stdin }) {
  const { cmd, args } = lang.runCmd();
  return await runCmd({ cmd, args, cwd: workDir, stdin, timeoutMs: CONFIG.runTimeoutMs });
}

async function compileDocker({ workDir, lang }) {
  if (!lang.compileCmd) return;
  const { cmd, args } = lang.compileCmd();
  const container = lang.dockerContainer;
  const dockerArgs = [
    "exec",
    "-i",
    "-w",
    path.posix.join(CONFIG.dockerWorkDir, path.basename(workDir)),
    container,
    "timeout",
    "-k",
    "1",
    `${Math.ceil(CONFIG.compileTimeoutMs / 1000)}`,
    cmd,
    ...args,
  ];
  const result = await runCmd({ cmd: "docker", args: dockerArgs, cwd: undefined, stdin: "", timeoutMs: CONFIG.compileTimeoutMs + 500 });
  if (result.timedOut || result.code !== 0) {
    throw new Error(`컴파일 실패\n${result.stderr || result.stdout}`);
  }
}

async function runDocker({ workDir, lang, stdin }) {
  const container = lang.dockerContainer;
  const { cmd, args } = lang.runCmd();
  const dockerArgs = [
    "exec",
    "-i",
    "-w",
    path.posix.join(CONFIG.dockerWorkDir, path.basename(workDir)),
    container,
    "timeout",
    "-k",
    "1",
    `${Math.ceil(CONFIG.runTimeoutMs / 1000)}`,
    cmd,
    ...args,
  ];

  return await runCmd({ cmd: "docker", args: dockerArgs, cwd: undefined, stdin, timeoutMs: CONFIG.runTimeoutMs + 500 });
}

function pickRunner() {
  return CONFIG.runnerMode === "docker" ? runDocker : runLocal;
}

export async function runCases({ sessionId, participantId, problemId, langId, code, testcases }) {
  const lang = getLang(langId);
  if (!lang) throw new Error("지원하지 않는 언어입니다.");

  const runId = nanoid();
  const workDir = path.join(CONFIG.runnerWorkRoot, `${sessionId}_${participantId}_${problemId}_${runId}`);

  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(path.join(workDir, lang.filename), code, "utf8");

  const runner = pickRunner();
  const compiler = CONFIG.runnerMode === "docker" ? compileDocker : compileLocal;

  try {
    await compiler({ workDir, lang });
    const results = [];
    for (const tc of testcases) {
      const r = await runner({ workDir, lang, stdin: tc.input || "" });

      const stdout = normOut(r.stdout);
      const stderr = normOut(r.stderr);

      const expected = tc.expected != null ? normOut(tc.expected) : null;
      let pass = null;
      if (expected !== null) {
        pass = stdout === expected && !r.timedOut && r.code === 0;
      }

      results.push({
        input: tc.input || "",
        expected: tc.expected ?? null,
        stdout,
        stderr,
        exitCode: r.code,
        timedOut: r.timedOut,
        pass,
      });
    }

    return { runId, results };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
