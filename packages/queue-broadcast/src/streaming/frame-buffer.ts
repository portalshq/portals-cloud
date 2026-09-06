/**
 * Frame buffer management for real-time video streaming.
 * Extracted and adapted from infinite-tv's RTMP streamer patterns.
 */

export interface FrameBufferOptions {
  maxSize?: number;
}

/** A bounded FIFO that retains the newest frames when a producer gets ahead. */
export class FrameBuffer<T> {
  private readonly queue: T[] = [];
  private readonly maxSize: number;
  private framesDropped = 0;
  private framesAddedTotal = 0;

  constructor(options: FrameBufferOptions = {}) {
    this.maxSize = options.maxSize ?? 1_000;
    if (!Number.isInteger(this.maxSize) || this.maxSize < 1) {
      throw new TypeError("maxSize must be a positive integer");
    }
  }

  /** Adds a frame and returns false when the oldest queued frame was dropped. */
  addFrame(frame: T): boolean {
    const droppedFrame = this.queue.length === this.maxSize;
    if (droppedFrame) {
      this.queue.shift();
      this.framesDropped++;
    }

    this.queue.push(frame);
    this.framesAddedTotal++;
    return !droppedFrame;
  }

  addFrameBatch(frames: readonly T[]): number {
    let processedCount = 0;
    for (const frame of frames) {
      this.addFrame(frame);
      processedCount++;
    }
    return processedCount;
  }

  getNextFrame(): T | null {
    return this.queue.shift() ?? null;
  }

  getStatus() {
    return {
      queueSize: this.queue.length,
      maxSize: this.maxSize,
      framesDropped: this.framesDropped,
      framesAddedTotal: this.framesAddedTotal,
      utilization: this.queue.length / this.maxSize,
    };
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.queue.length = 0;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.framesDropped = 0;
    this.framesAddedTotal = 0;
  }
}
