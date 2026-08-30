/**
 * Frame buffer management for real-time video streaming.
 * Extracted and adapted from infinite-tv's RTMP streamer patterns.
 */

export interface FrameBufferOptions {
  maxsize?: number;
  targetFps?: number;
}

export class FrameBuffer {
  private queue: ArrayBuffer[];
  private maxSize: number;
  private targetFps: number;
  private framesDropped: number;
  private framesAddedTotal: number;

  constructor(options: FrameBufferOptions = {}) {
    this.maxSize = options.maxsize ?? 1000; // ~9 seconds at 16fps
    this.targetFps = options.targetFps ?? 24;
    this.queue = [];
    this.framesDropped = 0;
    this.framesAddedTotal = 0;
  }

  /**
   * Add a frame to the buffer. Drops oldest frame if buffer is full.
   */
  addFrame(frame: ArrayBuffer): boolean {
    try {
      this.queue.push(frame);
      this.framesAddedTotal++;
      return true;
    } catch {
      // Buffer full - drop oldest frame
      if (this.queue.length > 0) {
        this.queue.shift();
        this.framesDropped++;
      }
      this.queue.push(frame);
      this.framesAddedTotal++;
      return false;
    }
  }

  /**
   * Add multiple frames efficiently
   */
  addFrameBatch(frames: ArrayBuffer[]): number {
    let processedCount = 0;
    for (const frame of frames) {
      this.addFrame(frame);
      processedCount++;
    }
    return processedCount;
  }

  /**
   * Get the next frame for streaming
   */
  getNextFrame(): ArrayBuffer | null {
    if (this.queue.length === 0) {
      return null;
    }
    return this.queue.shift() || null;
  }

  /**
   * Get current buffer status
   */
  getStatus() {
    return {
      queueSize: this.queue.length,
      maxSize: this.maxSize,
      framesDropped: this.framesDropped,
      framesAddedTotal: this.framesAddedTotal,
      targetFps: this.targetFps,
      utilization: this.queue.length / this.maxSize,
    };
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.queue = [];
    this.framesDropped = 0;
    this.framesAddedTotal = 0;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.framesDropped = 0;
    this.framesAddedTotal = 0;
  }
}