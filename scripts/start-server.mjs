import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = process.env.PORT || "8787";
const wrangler = [
  "--import",
  "./scripts/sites-env.mjs",
  "./node_modules/wrangler/bin/wrangler.js",
];
const persistDir = process.env.KULT_STATE_DIR || ".wrangler/state";
const persist = [ "--local", "--persist-to", persistDir, "--config", "dist/server/wrangler.json" ];

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...wrangler, ...args], { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`wrangler exited with ${code ?? "no code"}`));
    });
  });
}

try {
  await run(["d1", "migrations", "apply", "DB", ...persist]);
} catch (error) {
  console.error(error);
}

const server = spawn(process.execPath, [
  ...wrangler,
  "dev",
  ...persist,
  "--ip",
  "0.0.0.0",
  "--port",
  port,
  "--inspector-port",
  "0",
], { cwd: root, stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
