import { z } from "zod";

// Zod probes `Function("")` on first parse to decide whether to compile fast
// validators. Our CSP has no 'unsafe-eval', so the probe fails harmlessly but
// Firefox logs a CSP violation on every page. Skip the probe entirely.
z.config({ jitless: true });
