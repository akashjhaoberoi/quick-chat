"use client";

/**
 * Synthesized ringtone (WebAudio, no audio files) plus vibration.
 *
 * Browsers may refuse to start an AudioContext without a prior user gesture;
 * in that case the tone starts on the first tap/keypress instead and the
 * visual ringing UI is still shown. Call the returned function to stop.
 */
export function startRingtone(options: { vibrate?: boolean; pattern?: "incoming" | "outgoing" } = {}): () => void {
  if (typeof window === "undefined") return () => undefined;
  const pattern = options.pattern ?? "incoming";
  let stopped = false;
  let ctx: AudioContext | null = null;
  let timer: number | undefined;
  let vibrateTimer: number | undefined;

  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  const tone = (freq: number, start: number, duration: number, gain: number) => {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  };

  const ring = () => {
    if (!ctx || stopped || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.05;
    if (pattern === "incoming") {
      // A bright three-note rising chime, played twice.
      const notes = [659.25, 830.61, 987.77];
      for (let rep = 0; rep < 2; rep++) {
        notes.forEach((f, i) => tone(f, t + rep * 0.62 + i * 0.14, 0.42, 0.18));
      }
    } else {
      // Soft outgoing "ringback": a gentle dual tone.
      tone(440, t, 1.1, 0.06);
      tone(523.25, t, 1.1, 0.04);
    }
  };

  const unlock = () => {
    if (!ctx || stopped) return;
    void ctx.resume().then(ring).catch(() => undefined);
  };

  if (Ctor) {
    try {
      ctx = new Ctor();
      void ctx
        .resume()
        .then(ring)
        .catch(() => undefined);
      timer = window.setInterval(ring, pattern === "incoming" ? 2600 : 3200);
      window.addEventListener("pointerdown", unlock, { once: true });
      window.addEventListener("keydown", unlock, { once: true });
    } catch {
      ctx = null;
    }
  }

  if (options.vibrate && typeof navigator !== "undefined" && "vibrate" in navigator) {
    const buzz = () => {
      try {
        navigator.vibrate([500, 250, 500]);
      } catch {
        // Some browsers throw without user activation.
      }
    };
    buzz();
    vibrateTimer = window.setInterval(buzz, 2600);
  }

  return () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(timer);
    window.clearInterval(vibrateTimer);
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    if (options.vibrate && "vibrate" in navigator) {
      try {
        navigator.vibrate(0);
      } catch {
        // ignore
      }
    }
    void ctx?.close().catch(() => undefined);
    ctx = null;
  };
}
