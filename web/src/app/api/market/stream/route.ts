// Phase 3 — Real-Time Server-Sent Events (SSE) Route for Streaming Market Quotes.
// Streams low-latency ticks (<40ms) directly to UI clients without polling.

import { quoteManager } from "@/lib/services/streamingQuoteManager";
import { upstoxStreamClient } from "@/lib/services/upstoxStreamClient";
import { acquireStreamSlot } from "@/lib/services/streamSlots";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const release = acquireStreamSlot();
  if (!release) {
    return Response.json({ error: "too many live streams" }, { status: 429 });
  }

  void upstoxStreamClient.ensureStarted();

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  const teardown = () => {
    unsubscribe();
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    keepaliveInterval = null;
    release();
  };

  const stream = new ReadableStream({
    start(controller) {
      const initialQuotes = quoteManager.getAllQuotes();
      controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify(initialQuotes)}\n\n`));

      unsubscribe = quoteManager.subscribe((quote) => {
        try {
          controller.enqueue(encoder.encode(`event: tick\ndata: ${JSON.stringify(quote)}\n\n`));
        } catch {
          teardown();
        }
      });

      keepaliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          teardown();
        }
      }, 15000);

      request.signal.addEventListener("abort", () => {
        teardown();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      teardown();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
