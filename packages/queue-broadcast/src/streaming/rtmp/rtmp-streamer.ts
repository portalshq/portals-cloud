import { spawn, type ChildProcess } from "node:child_process";

import type { TextOverlayConfig } from "../../client.js";
import { FrameBuffer } from "../frame-buffer.js";

/** A Base64-encoded JPEG image, optionally prefixed with a JPEG data URL. */
export type Base64JpegFrame = string;

export interface RTMPStreamerOptions {
  streamKey: string;
  fps?: number;
  width?: number;
  height?: number;
  videoBitrate?: string;
  audioBitrate?: string;
  rtmpUrl?: string;
  /** Include a silent AAC track for RTMP services that require audio. */
  enableAudio?: boolean;
  /** Path to the FFmpeg executable. Defaults to `ffmpeg` on PATH. */
  ffmpegPath?: string;
  /** Maximum number of decoded JPEG frames retained while FFmpeg catches up. */
  maxBufferSize?: number;
  /** Grace period before FFmpeg is force-killed during shutdown. */
  shutdownTimeoutMs?: number;
  /** Text rendered by FFmpeg directly onto the outgoing video. */
  textOverlay?: TextOverlayConfig;
  /** Duration of the generated audio used to time `textOverlay`. */
  audioDurationSeconds?: number;
}

interface ResolvedRTMPStreamerOptions extends Omit<Required<RTMPStreamerOptions>, "textOverlay" | "audioDurationSeconds"> {
  textOverlay?: TextOverlayConfig;
  audioDurationSeconds?: number;
}

export interface StreamStatus {
  isStreaming: boolean;
  framesSent: number;
  framesDropped: number;
  framesUnderrun: number;
  queueSize: number;
  currentFps: number;
  targetFps: number;
  uptime: number;
  lastError?: string;
}

const JPEG_DATA_URL = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const DEFAULT_OVERLAY_DURATION_SECONDS = 5;
const OVERLAY_HEAD_AND_TAIL_SECONDS = 1.5;
const OVERLAY_PADDING = 20;

/**
 * Streams Base64 JPEG frames to one RTMP destination through an FFmpeg child
 * process. It never owns content generation or stream provisioning.
 */
export class RTMPStreamer {
  private readonly options: ResolvedRTMPStreamerOptions;
  private readonly frameBuffer: FrameBuffer<Buffer>;
  private ffmpegProcess: ChildProcess | null = null;
  private isStreaming = false;
  private isWaitingForDrain = false;
  private streamingTimer: NodeJS.Timeout | null = null;
  private startTime = 0;
  private framesSent = 0;
  private framesUnderrun = 0;
  private lastFrame: Buffer | null = null;
  private lastError: string | undefined;

  constructor(options: RTMPStreamerOptions) {
    this.options = {
      streamKey: options.streamKey,
      fps: options.fps ?? 24,
      width: options.width ?? 640,
      height: options.height ?? 480,
      videoBitrate: options.videoBitrate ?? "1500k",
      audioBitrate: options.audioBitrate ?? "128k",
      rtmpUrl: options.rtmpUrl ?? `rtmp://live.twitch.tv/app/${options.streamKey}`,
      enableAudio: options.enableAudio ?? false,
      ffmpegPath: options.ffmpegPath ?? "ffmpeg",
      maxBufferSize: options.maxBufferSize ?? 1_000,
      shutdownTimeoutMs: options.shutdownTimeoutMs ?? 5_000,
      textOverlay: options.textOverlay,
      audioDurationSeconds: options.audioDurationSeconds,
    };
    this.validateOptions();
    this.frameBuffer = new FrameBuffer<Buffer>({ maxSize: this.options.maxBufferSize });
  }

  async startStream(): Promise<void> {
    if (this.isStreaming) return;

    this.lastError = undefined;
    this.resetMetrics();
    const process = this.createFfmpegProcess();
    await this.waitForProcessStart(process);

    this.ffmpegProcess = process;
    this.isStreaming = true;
    this.startTime = Date.now();
    process.once("error", (error) => this.handleProcessFailure(error));
    process.once("exit", (code, signal) => {
      if (this.isStreaming) {
        this.handleProcessFailure(new Error(`FFmpeg exited (${code ?? signal ?? "unknown"})`));
      }
    });
    this.scheduleNextFrame(0);
  }

  async stopStream(): Promise<void> {
    if (!this.isStreaming && !this.ffmpegProcess) return;

    this.isStreaming = false;
    this.clearStreamingTimer();
    this.frameBuffer.clear();
    this.lastFrame = null;
    const process = this.ffmpegProcess;
    this.ffmpegProcess = null;
    if (!process) return;

    process.stdin?.end();
    await this.waitForProcessExit(process);
  }

  /** Queues one Base64 JPEG frame. Invalid frame data is rejected synchronously. */
  addFrame(frame: Base64JpegFrame): boolean {
    if (!this.isStreaming) return false;
    return this.frameBuffer.addFrame(decodeJpegFrame(frame));
  }

  addFrameBatch(frames: readonly Base64JpegFrame[]): number {
    let processedCount = 0;
    for (const frame of frames) {
      this.addFrame(frame);
      processedCount++;
    }
    return processedCount;
  }

  getStatus(): StreamStatus {
    const uptime = this.isStreaming ? Date.now() - this.startTime : 0;
    const currentFps = uptime > 0 ? this.framesSent / (uptime / 1_000) : 0;
    const bufferStatus = this.frameBuffer.getStatus();
    return {
      isStreaming: this.isStreaming,
      framesSent: this.framesSent,
      framesDropped: bufferStatus.framesDropped,
      framesUnderrun: this.framesUnderrun,
      queueSize: bufferStatus.queueSize,
      currentFps: Math.round(currentFps * 10) / 10,
      targetFps: this.options.fps,
      uptime,
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }

  getMetrics(): Record<string, unknown> {
    return { ...this.getStatus() };
  }

  resetMetrics(): void {
    this.framesSent = 0;
    this.framesUnderrun = 0;
    this.frameBuffer.clear();
    this.frameBuffer.resetMetrics();
  }

  private createFfmpegProcess(): ChildProcess {
    return spawn(this.options.ffmpegPath, this.getFfmpegArguments(), {
      stdio: ["pipe", "ignore", "pipe"],
    });
  }

  private getFfmpegArguments(): string[] {
    const videoArguments = [
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "-framerate", String(this.options.fps),
      "-i", "pipe:0",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-tune", "zerolatency",
      "-pix_fmt", "yuv420p",
      "-r", String(this.options.fps),
      "-g", String(this.options.fps),
      "-b:v", this.options.videoBitrate,
    ];
    const audioArguments = this.options.enableAudio
      ? ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100", "-c:a", "aac", "-b:a", this.options.audioBitrate]
      : ["-an"];
    const overlayArguments = this.options.textOverlay
      ? ["-vf", createDrawtextFilter(this.options.textOverlay, getTextOverlayVisibleDuration(this.options.audioDurationSeconds))]
      : [];

    return [
      "-hide_banner",
      "-loglevel", "warning",
      ...videoArguments,
      ...audioArguments,
      ...overlayArguments,
      "-f", "flv",
      "-flvflags", "no_duration_filesize",
      this.options.rtmpUrl,
    ];
  }

  private async waitForProcessStart(process: ChildProcess): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onSpawn = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(new Error(`Unable to start FFmpeg: ${error.message}`, { cause: error }));
      };
      const cleanup = () => {
        process.removeListener("spawn", onSpawn);
        process.removeListener("error", onError);
      };
      process.once("spawn", onSpawn);
      process.once("error", onError);
    });
  }

  private scheduleNextFrame(delayMs: number): void {
    if (!this.isStreaming || this.isWaitingForDrain) return;
    this.streamingTimer = setTimeout(() => this.writeNextFrame(), delayMs);
  }

  private writeNextFrame(): void {
    if (!this.isStreaming || this.isWaitingForDrain) return;
    const frame = this.frameBuffer.getNextFrame() ?? this.lastFrame;
    if (!frame) {
      this.framesUnderrun++;
      this.scheduleNextFrame(1_000 / this.options.fps);
      return;
    }

    try {
      this.lastFrame = frame;
      const stdin = this.ffmpegProcess?.stdin;
      if (!stdin || stdin.destroyed || !stdin.writable) {
        throw new Error("FFmpeg stdin is not writable");
      }
      this.framesSent++;
      if (!stdin.write(frame)) {
        this.isWaitingForDrain = true;
        stdin.once("drain", () => {
          this.isWaitingForDrain = false;
          this.scheduleNextFrame(0);
        });
        return;
      }
      this.scheduleNextFrame(1_000 / this.options.fps);
    } catch (error) {
      this.handleProcessFailure(error);
    }
  }

  private async waitForProcessExit(process: ChildProcess): Promise<void> {
    if (process.exitCode !== null || process.killed) return;
    const exited = new Promise<void>((resolve) => process.once("exit", () => resolve()));
    const timedOut = new Promise<void>((resolve) => setTimeout(resolve, this.options.shutdownTimeoutMs));
    await Promise.race([exited, timedOut]);
    if (process.exitCode === null && !process.killed) process.kill("SIGKILL");
  }

  private handleProcessFailure(error: unknown): void {
    this.lastError = error instanceof Error ? error.message : String(error);
    this.isStreaming = false;
    this.clearStreamingTimer();
  }

  private clearStreamingTimer(): void {
    if (this.streamingTimer) clearTimeout(this.streamingTimer);
    this.streamingTimer = null;
  }

  private validateOptions(): void {
    if (!this.options.streamKey.trim()) throw new TypeError("streamKey is required");
    if (!Number.isInteger(this.options.fps) || this.options.fps < 1) throw new TypeError("fps must be a positive integer");
    if (!Number.isInteger(this.options.width) || this.options.width < 1) throw new TypeError("width must be a positive integer");
    if (!Number.isInteger(this.options.height) || this.options.height < 1) throw new TypeError("height must be a positive integer");
    if (!Number.isInteger(this.options.shutdownTimeoutMs) || this.options.shutdownTimeoutMs < 0) {
      throw new TypeError("shutdownTimeoutMs must be a non-negative integer");
    }
    const rtmpUrl = new URL(this.options.rtmpUrl);
    if (rtmpUrl.protocol !== "rtmp:" && rtmpUrl.protocol !== "rtmps:") {
      throw new TypeError("rtmpUrl must use rtmp or rtmps");
    }
    if (this.options.audioDurationSeconds !== undefined && (!Number.isFinite(this.options.audioDurationSeconds) || this.options.audioDurationSeconds < 0)) {
      throw new TypeError("audioDurationSeconds must be a non-negative finite number");
    }
    if (this.options.textOverlay) validateTextOverlay(this.options.textOverlay);
  }
}

/**
 * Keeps an overlay on screen for the audio plus a 1.5 second head and tail.
 * Streams without generated audio use a five second default instead.
 */
export function getTextOverlayVisibleDuration(audioDurationSeconds?: number): number {
  if (audioDurationSeconds !== undefined && (!Number.isFinite(audioDurationSeconds) || audioDurationSeconds < 0)) {
    throw new TypeError("audioDurationSeconds must be a non-negative finite number");
  }
  return audioDurationSeconds === undefined
    ? DEFAULT_OVERLAY_DURATION_SECONDS
    : audioDurationSeconds + (OVERLAY_HEAD_AND_TAIL_SECONDS * 2);
}

function createDrawtextFilter(overlay: TextOverlayConfig, visibleDurationSeconds: number): string {
  const position = overlay.position ?? "bottom";
  const coordinates = getOverlayCoordinates(position);
  const fontFile = overlay.fontFile ? `:fontfile='${escapeDrawtextValue(overlay.fontFile)}'` : "";
  const fontSize = overlay.fontSize ?? 36;
  const fontColor = overlay.fontColor ?? "white";
  return `drawtext=text='${escapeDrawtextValue(overlay.text)}'${fontFile}:x=${coordinates.x}:y=${coordinates.y}:fontsize=${fontSize}:fontcolor=${escapeDrawtextValue(fontColor)}:enable='between(t,0,${visibleDurationSeconds})'`;
}

function getOverlayCoordinates(position: NonNullable<TextOverlayConfig["position"]>): { x: string; y: string } {
  const x = "(w-text_w)/2";
  if (position === "top") return { x, y: String(OVERLAY_PADDING) };
  if (position === "center") return { x, y: "(h-text_h)/2" };
  return { x, y: `h-text_h-${OVERLAY_PADDING}` };
}

function validateTextOverlay(overlay: TextOverlayConfig): void {
  if (!overlay.text.trim()) throw new TypeError("textOverlay.text is required");
  if (overlay.fontSize !== undefined && (!Number.isFinite(overlay.fontSize) || overlay.fontSize <= 0)) {
    throw new TypeError("textOverlay.fontSize must be a positive finite number");
  }
}

function escapeDrawtextValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/[\[\]]/g, "\\$&")
    .replace(/\r?\n/g, "\\n");
}

function decodeJpegFrame(frame: Base64JpegFrame): Buffer {
  const encoded = JPEG_DATA_URL.exec(frame)?.[1] ?? frame;
  if (!BASE64.test(encoded) || encoded.length % 4 === 1) {
    throw new TypeError("frame must be a Base64-encoded JPEG image");
  }
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length < 4 || decoded[0] !== 0xff || decoded[1] !== 0xd8 || decoded.at(-2) !== 0xff || decoded.at(-1) !== 0xd9) {
    throw new TypeError("frame must contain a complete JPEG image");
  }
  return decoded;
}
