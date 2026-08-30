/**
 * Platform-agnostic RTMP streaming infrastructure.
 * Extracted and adapted from infinite-tv's FFmpegRTMPStreamer.
 * 
 * Note: This requires FFmpeg to be available in the deployment environment.
 * For containerized deployment, use an image with FFmpeg pre-installed.
 */

export interface RTMPStreamerOptions {
  streamKey: string;
  fps?: number;
  width?: number;
  height?: number;
  videoBitrate?: string;
  audioBitrate?: string;
  rtmpUrl?: string;
  enableAudio?: boolean;
}

export interface StreamStatus {
  isStreaming: boolean;
  framesSent: number;
  framesDropped: number;
  queueSize: number;
  currentFps: number;
  targetFps: number;
  uptime: number;
}

/**
 * RTMP streamer using FFmpeg for video output.
 * Handles frame buffering, FPS control, and graceful degradation.
 */
export class RTMPStreamer {
  private options: Required<RTMPStreamerOptions>;
  private isStreaming: boolean = false;
  private ffmpegProcess: any = null;
  private frameBuffer: ArrayBuffer[] = [];
  private startTime: number = 0;
  private framesSent: number = 0;
  private framesDropped: number = 0;

  constructor(options: RTMPStreamerOptions) {
    this.options = {
      streamKey: options.streamKey,
      fps: options.fps ?? 24,
      width: options.width ?? 640,
      height: options.height ?? 480,
      videoBitrate: options.videoBitrate ?? '1500k',
      audioBitrate: options.audioBitrate ?? '128k',
      rtmpUrl: options.rtmpUrl ?? `rtmp://live.twitch.tv/app/${options.streamKey}`,
      enableAudio: options.enableAudio ?? false,
    };
  }

  /**
   * Start the RTMP stream
   */
  async startStream(): Promise<void> {
    if (this.isStreaming) {
      console.warn('Stream already running');
      return;
    }

    console.log(`Starting RTMP stream to ${this.options.rtmpUrl}`);
    console.log(`Resolution: ${this.options.width}x${this.options.height} @ ${this.options.fps}fps`);

    // In a real implementation, this would spawn FFmpeg with the appropriate
    // arguments. For now, we simulate the process start.
    this.isStreaming = true;
    this.startTime = Date.now();
    this.framesSent = 0;
    this.framesDropped = 0;

    // Start the streaming loop
    this.startStreamingLoop();
  }

  /**
   * Stop the RTMP stream
   */
  async stopStream(): Promise<void> {
    if (!this.isStreaming) {
      return;
    }

    console.log('Stopping RTMP stream');
    this.isStreaming = false;

    // In a real implementation, this would gracefully shut down FFmpeg
    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 5000));
        this.ffmpegProcess.kill('SIGKILL');
      } catch (error) {
        console.error('Error stopping FFmpeg:', error);
      }
      this.ffmpegProcess = null;
    }

    this.frameBuffer = [];
  }

  /**
   * Add a frame to the streaming buffer
   */
  addFrame(frame: ArrayBuffer): boolean {
    if (!this.isStreaming) {
      return false;
    }

    // Simple buffer management with drop handling
    if (this.frameBuffer.length > 1000) {
      this.frameBuffer.shift();
      this.framesDropped++;
    }

    this.frameBuffer.push(frame);
    return true;
  }

  /**
   * Add multiple frames efficiently
   */
  addFrameBatch(frames: ArrayBuffer[]): number {
    let processedCount = 0;
    for (const frame of frames) {
      if (this.addFrame(frame)) {
        processedCount++;
      }
    }
    return processedCount;
  }

  /**
   * Get current stream status
   */
  getStatus(): StreamStatus {
    const uptime = this.isStreaming ? Date.now() - this.startTime : 0;
    const currentFps = this.isStreaming && uptime > 0 
      ? (this.framesSent / (uptime / 1000)) 
      : 0;

    return {
      isStreaming: this.isStreaming,
      framesSent: this.framesSent,
      framesDropped: this.framesDropped,
      queueSize: this.frameBuffer.length,
      currentFps: Math.round(currentFps * 10) / 10,
      targetFps: this.options.fps,
      uptime,
    };
  }

  /**
   * Internal streaming loop that maintains FPS timing
   */
  private startStreamingLoop(): void {
    const frameDuration = 1000 / this.options.fps;

    const loop = () => {
      if (!this.isStreaming) {
        return;
      }

      const loopStart = Date.now();

      try {
        // Get next frame from buffer
        if (this.frameBuffer.length > 0) {
          const frame = this.frameBuffer.shift();
          // In real implementation, send frame to FFmpeg stdin
          this.framesSent++;
        } else {
          // Buffer underrun - would send placeholder frame
          this.framesDropped++;
        }

        // Maintain FPS timing
        const elapsed = Date.now() - loopStart;
        const sleepTime = Math.max(0, frameDuration - elapsed);

        setTimeout(loop, sleepTime);
      } catch (error) {
        console.error('Streaming loop error:', error);
        this.isStreaming = false;
      }
    };

    setTimeout(loop, 0);
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.framesSent = 0;
    this.framesDropped = 0;
    this.frameBuffer = [];
  }
}