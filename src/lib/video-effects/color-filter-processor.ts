import type { ProcessorOptions, Track, TrackProcessor } from "livekit-client";
import { NEUTRAL_COLOR, type ColorParams } from "./effects";

/**
 * A lightweight LiveKit video TrackProcessor that applies colour filters on
 * the GPU: source track → hidden <video> → WebGL fragment shader → canvas →
 * canvas.captureStream() → `processedTrack` (what LiveKit sends).
 *
 * - Output is capped at 1280×720 (orientation-aware) and `maxFps` (≤ 30).
 * - Frames are driven by a tiny blob Worker timer so the outgoing video
 *   doesn't freeze when the tab is in the background (rAF/timers are
 *   throttled there). Falls back to window timers if workers are blocked.
 * - When the source track ends (camera turned off) the loop pauses; LiveKit
 *   calls `restart()` with the new camera track on unmute / camera switch and
 *   the same `processedTrack` keeps flowing, so nothing needs re-publishing.
 * - `setParams()` updates the filter live (no re-init), e.g. for the slider.
 */
export class ColorFilterProcessor implements TrackProcessor<Track.Kind.Video> {
  readonly name = "qc-color-filter";
  processedTrack?: MediaStreamTrack;

  private params: ColorParams;
  private readonly maxFps: number;
  private canvas?: HTMLCanvasElement;
  private gl?: WebGLRenderingContext;
  private uniforms?: Record<UniformName, WebGLUniformLocation | null>;
  private texture?: WebGLTexture | null;
  private video?: HTMLVideoElement;
  private source?: MediaStreamTrack;
  private ticker?: Ticker;
  private destroyed = false;
  private readonly onSourceEnded = () => this.ticker?.stop();

  constructor(params: ColorParams = NEUTRAL_COLOR, opts: { maxFps?: number } = {}) {
    this.params = params;
    this.maxFps = Math.min(30, Math.max(1, opts.maxFps ?? 30));
  }

  static get isSupported(): boolean {
    if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") return false;
    if (!("captureStream" in HTMLCanvasElement.prototype)) return false;
    try {
      return Boolean(document.createElement("canvas").getContext("webgl"));
    } catch {
      return false;
    }
  }

  setParams(params: ColorParams): void {
    this.params = params;
  }

  async init(opts: ProcessorOptions<Track.Kind.Video>): Promise<void> {
    this.destroyed = false;
    try {
      await this.setup(opts.track);
    } catch (error) {
      await this.destroy();
      throw error;
    }
  }

  private async setup(track: MediaStreamTrack) {
    const canvas = document.createElement("canvas");
    // Start at the source size so the processed track reports sensible
    // dimensions before the first frame is drawn.
    const { width, height } = track.getSettings();
    [canvas.width, canvas.height] = width && height ? fitWithin(width, height) : [1280, 720];
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL unavailable");
    // Kept in the DOM (hidden) because some WebKit builds only emit
    // captureStream frames for attached canvases.
    canvas.style.display = "none";
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.qcVideoEffect = "";
    document.body.appendChild(canvas);
    this.canvas = canvas;
    this.gl = gl;
    this.setupGl(gl);

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    this.video = video;

    const stream = canvas.captureStream(this.maxFps);
    this.processedTrack = stream.getVideoTracks()[0];
    this.ticker = createTicker(1000 / this.maxFps, () => this.draw());
    await this.attachSource(track);
  }

  async restart(opts: ProcessorOptions<Track.Kind.Video>): Promise<void> {
    if (this.destroyed) return;
    await this.attachSource(opts.track);
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.ticker?.dispose();
    this.ticker = undefined;
    this.source?.removeEventListener("ended", this.onSourceEnded);
    this.source = undefined;
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video = undefined;
    }
    this.processedTrack?.stop();
    this.processedTrack = undefined;
    if (this.gl) {
      try {
        if (this.texture) this.gl.deleteTexture(this.texture);
        this.gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        // context already lost
      }
    }
    this.gl = undefined;
    this.uniforms = undefined;
    this.texture = undefined;
    this.canvas?.remove();
    this.canvas = undefined;
  }

  private async attachSource(track: MediaStreamTrack) {
    const video = this.video;
    if (!video) return;
    this.source?.removeEventListener("ended", this.onSourceEnded);
    this.source = track;
    track.addEventListener("ended", this.onSourceEnded);
    video.srcObject = new MediaStream([track]);
    // Don't hold LiveKit's track lock on a slow play(); the ticker retries
    // play() while the element is still paused.
    await Promise.race([video.play().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 1000))]);
    if (track.readyState === "live") this.ticker?.start();
  }

  private setupGl(gl: WebGLRenderingContext) {
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error("WebGL program creation failed");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "WebGL link failed");
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const u = (n: UniformName) => gl.getUniformLocation(program, n);
    this.uniforms = {
      u_tex: u("u_tex"),
      u_texel: u("u_texel"),
      u_brightness: u("u_brightness"),
      u_contrast: u("u_contrast"),
      u_saturation: u("u_saturation"),
      u_sepia: u("u_sepia"),
      u_tint: u("u_tint"),
      u_soften: u("u_soften"),
      u_vignette: u("u_vignette"),
    };
    gl.uniform1i(this.uniforms.u_tex, 0);
  }

  private draw() {
    const { gl, canvas, video, uniforms } = this;
    if (!gl || !canvas || !video || !uniforms || this.destroyed) return;
    // MediaStreamTrack.stop() (LiveKit's camera-off) doesn't fire "ended", so
    // poll the state: pause until restart() hands us the next camera track.
    if (this.source?.readyState !== "live") {
      this.ticker?.stop();
      return;
    }
    if (video.paused) {
      void video.play().catch(() => undefined);
      return;
    }
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    if (gl.isContextLost()) return;

    const [w, h] = fitWithin(video.videoWidth, video.videoHeight);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, this.texture ?? null);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
    } catch {
      return;
    }
    const p = this.params;
    // Blur taps are spaced in source pixels, so softening looks the same at any size.
    gl.uniform2f(uniforms.u_texel, 1 / w, 1 / h);
    gl.uniform1f(uniforms.u_brightness, p.brightness);
    gl.uniform1f(uniforms.u_contrast, p.contrast);
    gl.uniform1f(uniforms.u_saturation, p.saturation);
    gl.uniform1f(uniforms.u_sepia, p.sepia);
    gl.uniform3f(uniforms.u_tint, p.tint[0], p.tint[1], p.tint[2]);
    gl.uniform1f(uniforms.u_soften, p.soften);
    gl.uniform1f(uniforms.u_vignette, p.vignette);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

type UniformName = "u_tex" | "u_texel" | "u_brightness" | "u_contrast" | "u_saturation" | "u_sepia" | "u_tint" | "u_soften" | "u_vignette";

const MAX_LONG = 1280;
const MAX_SHORT = 720;

function fitWithin(w: number, h: number): [number, number] {
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  const scale = Math.min(1, MAX_LONG / long, MAX_SHORT / short);
  // Even dimensions keep video encoders happy.
  return [Math.max(2, Math.round((w * scale) / 2) * 2), Math.max(2, Math.round((h * scale) / 2) * 2)];
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL shader creation failed");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "WebGL compile failed");
  return shader;
}

const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_sepia;
uniform vec3 u_tint;
uniform float u_soften;
uniform float u_vignette;

vec3 tap(vec2 o) { return texture2D(u_tex, v_uv + o * u_texel).rgb; }

void main() {
  vec3 c = texture2D(u_tex, v_uv).rgb;
  if (u_soften > 0.0) {
    // Edge-aware blur: average a ring of taps, then blend it in less where it
    // differs strongly from the centre pixel (keeps eyes/edges crisp).
    vec3 b = c;
    b += tap(vec2( 3.0, 0.0)); b += tap(vec2(-3.0, 0.0));
    b += tap(vec2( 0.0, 3.0)); b += tap(vec2( 0.0,-3.0));
    b += tap(vec2( 2.0, 2.0)); b += tap(vec2(-2.0, 2.0));
    b += tap(vec2( 2.0,-2.0)); b += tap(vec2(-2.0,-2.0));
    b += tap(vec2( 6.0, 0.0)); b += tap(vec2(-6.0, 0.0));
    b += tap(vec2( 0.0, 6.0)); b += tap(vec2( 0.0,-6.0));
    b /= 13.0;
    float d = length(b - c);
    c = mix(c, b, u_soften * (1.0 - smoothstep(0.06, 0.22, d)));
  }
  c *= u_brightness;
  c = (c - 0.5) * u_contrast + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, u_saturation);
  vec3 s = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
  c = mix(c, s, u_sepia);
  c *= u_tint;
  if (u_vignette > 0.0) {
    vec2 p = v_uv - 0.5;
    c *= 1.0 - u_vignette * dot(p, p) * 1.6;
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/* ---------------------------------------------------------------------------
 * Frame ticker: a blob Worker's setInterval is not throttled in background
 * tabs (CSP worker-src already allows blob:). Window timers are the fallback.
 * ------------------------------------------------------------------------- */

type Ticker = { start: () => void; stop: () => void; dispose: () => void };

function createTicker(intervalMs: number, onTick: () => void): Ticker {
  let running = false;
  try {
    const src = "let t=0;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}";
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = () => {
      if (running) onTick();
    };
    return {
      start: () => {
        if (running) return;
        running = true;
        worker.postMessage(intervalMs);
      },
      stop: () => {
        running = false;
        worker.postMessage(0);
      },
      dispose: () => {
        running = false;
        worker.terminate();
      },
    };
  } catch {
    let timer = 0;
    return {
      start: () => {
        if (running) return;
        running = true;
        timer = window.setInterval(onTick, intervalMs);
      },
      stop: () => {
        running = false;
        window.clearInterval(timer);
      },
      dispose: () => {
        running = false;
        window.clearInterval(timer);
      },
    };
  }
}
