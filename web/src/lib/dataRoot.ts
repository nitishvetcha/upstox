import path from "node:path";

/** Runtime data root. Tests and offline UI verification must set APP_DATA_DIR. */
export function dataRoot() {
  // turbopackIgnore: the runtime data directory is read at runtime, not bundled. Keeps the build from tracing it.
  return process.env.APP_DATA_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), ".data");
}
