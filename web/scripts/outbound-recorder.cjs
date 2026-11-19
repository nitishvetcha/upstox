/* eslint-disable @typescript-eslint/no-require-imports -- verification preload is CommonJS by design (node --require) */
// Preload for verification runs only (node --require). Records the host of every outbound HTTP(S) request and
// fetch() call to the file named by OUTBOUND_LOG. It never blocks or alters a request.
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const LOG = process.env.OUTBOUND_LOG;
function record(host) {
  if (LOG) fs.appendFileSync(LOG, `${host}\n`);
}
function hostOf(arg) {
  try {
    if (typeof arg === "string") return new URL(arg).hostname;
    if (arg instanceof URL) return arg.hostname;
    if (arg && typeof arg === "object") return arg.hostname || arg.host || "unknown";
  } catch { /* fall through */ }
  return "unknown";
}
const realFetch = globalThis.fetch;
globalThis.fetch = function recordedFetch(input, init) {
  record(hostOf(typeof input === "object" && input && "url" in input ? input.url : input));
  return realFetch(input, init);
};
for (const mod of [http, https]) {
  for (const name of ["request", "get"]) {
    const real = mod[name];
    mod[name] = function recorded(...args) {
      record(hostOf(args[0]));
      return real.apply(this, args);
    };
  }
}
