import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import readline from "node:readline";

const temporaryHome = await mkdtemp(join(tmpdir(), "travel-social-worker-"));
const worker = spawn(process.execPath, ["--import", "tsx", resolve("src/workers/social-read-worker.mjs")], {
  cwd: process.cwd(),
  env: { PATH: process.env.PATH, HOME: temporaryHome, NODE_ENV: "test" },
  stdio: ["pipe", "pipe", "pipe"],
});
const output = readline.createInterface({ input: worker.stdout, crlfDelay: Infinity });
const lines = [];
output.on("line", (line) => lines.push(JSON.parse(line)));

const requests = [
  { operation: "publish", platform: "xiaohongshu", url: "https://www.xiaohongshu.com/explore/example" },
  { operation: "read_social_content", platform: "xiaohongshu", url: "https://example.com/private" },
  { operation: "search_social_content", platform: "xiaohongshu", query: "上海本帮菜", limit: 5 },
  { operation: "read_social_content", platform: "xiaohongshu", url: "https://www.xiaohongshu.com/explore/example", command: "whoami" },
];
for (const request of requests) worker.stdin.write(`${JSON.stringify(request)}\n`);
worker.stdin.end();
await once(worker, "exit");

assert.equal(lines.length, requests.length);
assert.equal(lines[0].code, "TERMS_BLOCKED");
assert.equal(lines[1].code, "TERMS_BLOCKED");
assert.equal(lines[2].code, "AUTH_REQUIRED");
assert.equal(lines[3].code, "TERMS_BLOCKED");
assert.equal(lines.some((result) => result.rawCredentialsReturned === true || result.rawMediaReturned === true), false);

process.stdout.write(`${JSON.stringify({
  schemaVersion: "social-worker-no-login-smoke-v1",
  status: "passed_no_login_safety_smoke",
  isolatedHome: true,
  dedicatedAccountUsed: false,
  liveReadVerified: false,
  checks: ["write_operation_blocked", "arbitrary_url_blocked", "search_requires_account", "execution_field_blocked"],
})}\n`);
