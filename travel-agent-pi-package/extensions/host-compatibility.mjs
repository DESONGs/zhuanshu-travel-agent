import { assertCompatiblePiHost } from "../../src/agent/pi-host-compatibility.mjs";

// Keep the first package bootstrap free of TypeScript and host-version imports.
// Older Pi hosts must reach this gate before any business or subagent extension.
assertCompatiblePiHost({ allowUnknown: true });

export default function registerHostCompatibility() {
  assertCompatiblePiHost({ allowUnknown: true });
}
