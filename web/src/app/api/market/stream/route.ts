// Phase 3 — Real-Time Server-Sent Events (SSE) Route for Streaming Market Quotes.
// Streams low-latency ticks (<40ms) directly to UI clients without polling.

import { quoteManager } from "@/lib/services/streamingQuoteManager";
import { upstoxStreamClient } from "@/lib/services/upstoxStreamClient";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  // Ensure stream client / background ticker is running
  void upstoxStreamClient.ensureStarted();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send initial snapshot of all currently known quotes
      const initialQuotes = quoteManager.getAllQuotes();
      const snapshotPayload = JSON.stringify(initialQuotes);
      controller.enqueue(
        encoder.encode(`event: snapshot\ndata: ${snapshotPayload}\n\n`)
      );

      // 2. Subscribe to real-time tick ingestion events
      const unsubscribe = quoteManager.subscribe((quote) => {
        try {
          const tickPayload = JSON.stringify(quote);
          controller.enqueue(
            encoder.encode(`event: tick\ndata: ${tickPayload}\n\n`)
          );
        } catch {
          // Stream controller closed by client
        }
      });

      // 3. Keepalive ping every 15s to keep proxies / Cloudflare / local sockets alive
      const keepaliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          clearInterval(keepaliveInterval);
        }
      }, 15000);

      // 4. Handle client disconnection / abort
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(keepaliveInterval);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
