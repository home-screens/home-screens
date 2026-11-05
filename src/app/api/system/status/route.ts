import { subscribeToEvents, type UpgradeEvent } from '@/lib/upgrade';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * How often the stream says something while the install is silent. The
 * Chromium download prints nothing for a minute on a fast line and far
 * longer on a slow one; a comment every so often keeps whatever sits
 * between the Pi and the browser from cutting an idle connection, and
 * turns a client that has gone away into a failed write here, so its
 * listener is dropped instead of lingering until the install ends.
 */
const KEEPALIVE_MS = 15_000;

export const GET = withAuth(async () => {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      function teardown() {
        if (keepalive !== null) clearInterval(keepalive);
        keepalive = null;
        unsubscribe?.();
        unsubscribe = null;
      }

      function send(event: UpgradeEvent) {
        try {
          // Use named SSE events so the client can handle progress and output independently
          const sseType = event.type; // 'progress' or 'output'
          controller.enqueue(encoder.encode(`event: ${sseType}\ndata: ${JSON.stringify(event)}\n\n`));

          // Close stream when upgrade reaches a terminal state
          if (event.type === 'progress' && (event.step === 'complete' || event.step === 'error')) {
            setTimeout(() => {
              teardown();
              try {
                controller.close();
              } catch {
                // already closed
              }
            }, 100);
          }
        } catch {
          // Stream may be closed by client
        }
      }

      unsubscribe = subscribeToEvents(send);
      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          teardown();
        }
      }, KEEPALIVE_MS);
    },
    cancel() {
      if (keepalive !== null) clearInterval(keepalive);
      keepalive = null;
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}, 'Failed to establish SSE connection');
