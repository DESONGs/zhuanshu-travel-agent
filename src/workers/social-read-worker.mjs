import readline from "node:readline";
import { createSocialWorkerHandler } from "./social-worker-handler.mjs";

const MAX_REQUEST_BYTES = 64 * 1024;
const handler = createSocialWorkerHandler();
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });

for await (const line of lines) {
  if (!line.trim()) continue;
  let response;
  if (Buffer.byteLength(line, "utf8") > MAX_REQUEST_BYTES) {
    response = { status: "blocked", code: "TERMS_BLOCKED", reason: "request_too_large", items: [] };
  } else {
    try {
      response = await handler(JSON.parse(line));
    } catch {
      response = { status: "blocked", code: "SOURCE_CHANGED", reason: "invalid_json", items: [] };
    }
  }
  process.stdout.write(`${JSON.stringify(response)}\n`);
}
