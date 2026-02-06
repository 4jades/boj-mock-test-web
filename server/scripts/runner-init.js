import { execSync } from "child_process";
import { CONFIG } from "../src/config.js";

function hasContainer(name) {
  try {
    execSync(`docker inspect ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runContainer(name, image) {
  const cmd = [
    "docker",
    "run",
    "-d",
    "--name",
    name,
    "--network",
    "none",
    "--cpus",
    "1",
    "--memory",
    "512m",
    "-v",
    `${CONFIG.runnerWorkRoot}:${CONFIG.dockerWorkDir}`,
    image,
    "sleep",
    "infinity",
  ];

  execSync(cmd.join(" "), { stdio: "inherit" });
}

console.log("Initializing runner containers...");

if (!hasContainer(CONFIG.dockerPythonContainer)) {
  runContainer(CONFIG.dockerPythonContainer, "python:3.11-alpine");
} else {
  console.log(`${CONFIG.dockerPythonContainer} already exists`);
}

if (!hasContainer(CONFIG.dockerNodeContainer)) {
  runContainer(CONFIG.dockerNodeContainer, "node:20-alpine");
} else {
  console.log(`${CONFIG.dockerNodeContainer} already exists`);
}

console.log("Done.");
