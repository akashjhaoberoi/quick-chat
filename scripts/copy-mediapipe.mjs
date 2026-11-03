// Copies MediaPipe's WebAssembly runtime (used for call background effects)
// into public/ so browsers load it from Quick Chat itself, not a third-party CDN.
// Runs before every build; the copied files are git-ignored.
import { cpSync, existsSync, mkdirSync } from "node:fs";

const from = "node_modules/@mediapipe/tasks-vision/wasm";
const to = "public/mediapipe/wasm";
if (existsSync(from)) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`copied MediaPipe runtime to ${to}`);
} else {
  console.warn("MediaPipe runtime not found; background effects will be unavailable");
}
