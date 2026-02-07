import path from "path";
import dotenv from "dotenv";

dotenv.config();

const env = process.env;

export const CONFIG = {
  port: Number(env.PORT || 5179),
  dbPath: env.DB_PATH || path.resolve("./server-data.db"),
  sessionTtlHours: Number(env.SESSION_TTL_HOURS || 24),
  maxRunLogPerParticipant: Number(env.MAX_RUN_LOGS || 20),
  maxStdoutBytes: Number(env.MAX_STDOUT_BYTES || 64 * 1024),
  maxStderrBytes: Number(env.MAX_STDERR_BYTES || 64 * 1024),
  runTimeoutMs: Number(env.RUN_TIMEOUT_MS || 2000),
  compileTimeoutMs: Number(env.COMPILE_TIMEOUT_MS || 12000),
  maxConcurrentRunsPerSession: Number(env.MAX_CONCURRENT_RUNS || 2),
  runnerMode: env.RUNNER_MODE || "local",
  runnerWorkRoot: env.RUNNER_WORK_ROOT || "/tmp/boj-mock-run",
  dockerPythonContainer: env.DOCKER_PY_CONTAINER || "boj-mock-python",
  dockerNodeContainer: env.DOCKER_NODE_CONTAINER || "boj-mock-node",
  dockerCContainer: env.DOCKER_C_CONTAINER || "boj-mock-c",
  dockerCppContainer: env.DOCKER_CPP_CONTAINER || "boj-mock-cpp",
  dockerJavaContainer: env.DOCKER_JAVA_CONTAINER || "boj-mock-java",
  dockerKotlinContainer: env.DOCKER_KOTLIN_CONTAINER || "boj-mock-kotlin",
  dockerWorkDir: env.DOCKER_WORKDIR || "/workspace",
  exitOnFatal: String(env.EXIT_ON_FATAL || "true").toLowerCase() !== "false",
};
