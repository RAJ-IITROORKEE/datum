const { spawnSync } = require("node:child_process");

function run(command, args) {
  return spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

const generateResult = run("prisma", ["generate"]);

if (generateResult.stdout) process.stdout.write(generateResult.stdout);
if (generateResult.stderr) process.stderr.write(generateResult.stderr);

const generateOutput = `${generateResult.stdout || ""}\n${generateResult.stderr || ""}`;
const hasWindowsEperm =
  process.platform === "win32" &&
  generateOutput.includes("EPERM") &&
  generateOutput.includes("query_engine-windows.dll.node");

if ((generateResult.status ?? 1) !== 0 && !hasWindowsEperm) {
  process.exit(generateResult.status ?? 1);
}

if (hasWindowsEperm) {
  console.warn(
    "[build] prisma generate hit Windows EPERM lock; continuing with existing generated client"
  );
}

const buildResult = run("next", ["build"]);
if (buildResult.stdout) process.stdout.write(buildResult.stdout);
if (buildResult.stderr) process.stderr.write(buildResult.stderr);
process.exit(buildResult.status ?? 1);
