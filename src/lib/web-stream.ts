import type { Readable } from 'stream';

/**
 * Convert a Node Readable into a web ReadableStream for use as a Response body.
 *
 * Exists because Node 20's `Readable.toWeb` doesn't guard the cancellation
 * race: when a client aborts a response mid-stream (video elements do this
 * constantly), the web controller closes first and an in-flight chunk push
 * then throws `ERR_INVALID_STATE: Controller is already closed` as an
 * uncaughtException outside any request scope. This adapter guards every
 * controller call, destroys the source on cancel, and applies pause/resume
 * backpressure so large files never buffer fully in memory.
 */
export function toWebStream(source: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      source.on('data', (chunk: Buffer) => {
        try {
          controller.enqueue(chunk);
        } catch {
          // Consumer already cancelled — stop producing.
          source.destroy();
          return;
        }
        if ((controller.desiredSize ?? 1) <= 0) source.pause();
      });
      source.on('end', () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
      source.on('error', (err) => {
        try {
          controller.error(err);
        } catch {
          // already closed
        }
      });
    },
    pull() {
      source.resume();
    },
    cancel() {
      source.destroy();
    },
  });
}
