// Next.js instrumentation hook: startup and shutdown events, redacted.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNodeInstrumentation } = await import("./instrumentation.node.ts");
    registerNodeInstrumentation();
  }
}
