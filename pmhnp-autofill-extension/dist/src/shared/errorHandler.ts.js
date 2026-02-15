import { appendErrorLog } from "/src/shared/storage.ts.js";
export function captureError(error, context) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : void 0;
  console.error(`[PMHNP] Error in ${context}:`, error);
  appendErrorLog({
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    message,
    context,
    stack
  }).catch(() => {
  });
}
export function withErrorHandling(fn, context) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      captureError(err, context);
      throw err;
    }
  };
}
