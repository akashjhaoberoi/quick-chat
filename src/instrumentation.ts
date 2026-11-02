/** Validates configuration once at server startup and logs a clear report. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnvironment } = await import("@/lib/env");
  const { errors, warnings } = validateEnvironment();
  for (const e of errors) console.error(`[quick-chat] config error: ${e}`);
  for (const w of warnings) console.warn(`[quick-chat] config warning: ${w}`);
  if (errors.some((e) => e.includes("exposed to the browser"))) {
    // A leaked secret must never ship.
    throw new Error("Refusing to start: a secret is exposed through a NEXT_PUBLIC_ variable.");
  }
}
