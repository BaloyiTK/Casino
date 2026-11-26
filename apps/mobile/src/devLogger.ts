type ErrorContext = Record<string, string | number | boolean | null | undefined>;

function safeContext(context: ErrorContext = {}) {
  const safe: ErrorContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (/token|authorization|password|secret|api.?key|credential/i.test(key)) {
      safe[key] = "[REDACTED]";
    } else if (value === null || ["string", "number", "boolean", "undefined"].includes(typeof value)) {
      safe[key] = typeof value === "string"
        ? value.replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
        : value;
    }
  }
  return safe;
}

export function logDevError(
  scope: string,
  error: unknown,
  context: ErrorContext = {}
): void {
  if (!__DEV__) return;

  const record = typeof error === "object" && error !== null
    ? error as Record<string, unknown>
    : null;
  const normalized = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : {
        name: typeof record?.name === "string" ? record.name : "UnknownError",
        message: typeof record?.message === "string" ? record.message : String(error),
        code: typeof record?.code === "string" ? record.code : undefined
      };

  console.error("[Casino development error]", {
    timestamp: new Date().toISOString(),
    scope,
    ...normalized,
    context: safeContext(context)
  });
}
