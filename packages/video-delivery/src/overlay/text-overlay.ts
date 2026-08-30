/**
 * Text overlay processing for video frames.
 * Extracted and adapted from infinite-tv's TextOverlay for platform-agnostic use.
 */

export interface TextOverlayOptions {
  text: string;
  position?: 'top' | 'bottom' | 'center';
  fontSize?: number;
  fadeOut?: boolean;
  visibleRatio?: number;  // fraction of frames showing overlay
  maxWidth?: number;
  padding?: number;
}

export interface OverlayBatchOptions extends TextOverlayOptions {
  fadeOutFrames?: number;
}

/**
 * Text overlay processor for video frames.
 * Handles font sizing, text wrapping, and fade effects.
 */
export class TextOverlayProcessor {
  private fontCache: Map<number, any> = new Map();
  private overlayCache: Map<string, { overlay: string; pasteY: number }> = new Map();
  private totalFramesProcessed = 0;
  private totalProcessingTime = 0;

  /**
   * Apply text overlay to a single frame
   * Note: This is a simplified version - in production would use Canvas API or FFmpeg
   */
  applyOverlay(frameData: string, options: TextOverlayOptions): string {
    const startTime = Date.now();

    // For this implementation, we'll return the frame unchanged
    // In production, this would:
    // 1. Parse frame data (assume base64 image)
    // 2. Apply text overlay using Canvas API or FFmpeg
    // 3. Return processed frame data

    this.totalFramesProcessed++;
    this.totalProcessingTime += Date.now() - startTime;

    return frameData;
  }

  /**
   * Apply overlay to multiple frames with fade effect
   * Only shows overlay on first portion of frames, then fades out
   */
  applyOverlayBatch(frames: string[], options: OverlayBatchOptions): string[] {
    if (!frames.length) {
      return frames;
    }

    const startTime = Date.now();
    const visibleRatio = options.visibleRatio ?? 0.4;
    const fadeOutFrames = options.fadeOutFrames ?? 6;

    const visibleEnd = Math.max(1, Math.floor(frames.length * visibleRatio));
    const fadeStart = Math.max(0, visibleEnd - fadeOutFrames);

    for (let i = 0; i < frames.length; i++) {
      if (i < fadeStart) {
        frames[i] = this.applyOverlay(frames[i], options);
      } else if (i < visibleEnd) {
        // Fade out region
        const alpha = 1.0 - (i - fadeStart) / (visibleEnd - fadeStart);
        frames[i] = this.applyOverlayWithAlpha(frames[i], options, alpha);
      }
      // else: frame stays clean (no overlay)
    }

    this.totalFramesProcessed += frames.length;
    this.totalProcessingTime += Date.now() - startTime;

    return frames;
  }

  /**
   * Apply overlay with reduced opacity (fade effect)
   */
  private applyOverlayWithAlpha(frameData: string, options: TextOverlayOptions, alpha: number): string {
    // In production, this would apply the overlay with reduced alpha
    // For now, return unchanged
    return frameData;
  }

  /**
   * Get overlay performance metrics
   */
  getMetrics() {
    const avgTimePerFrame = this.totalFramesProcessed > 0
      ? this.totalProcessingTime / this.totalFramesProcessed
      : 0;

    return {
      framesProcessed: this.totalFramesProcessed,
      avgTimePerFrame: Math.round(avgTimePerFrame * 1000) / 1000,
      totalProcessingTime: this.totalProcessingTime,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.totalFramesProcessed = 0;
    this.totalProcessingTime = 0;
    this.overlayCache.clear();
  }

  /**
   * Get cached font (would use Canvas API in production)
   */
  private getFont(fontSize: number): any {
    if (this.fontCache.has(fontSize)) {
      return this.fontCache.get(fontSize);
    }
    // In production, would load font and cache it
    const font = { size: fontSize }; // placeholder
    this.fontCache.set(fontSize, font);
    return font;
  }

  /**
   * Wrap text to fit within max width
   */
  private wrapText(text: string, maxWidth: number, fontSize: number): string[] {
    // Simple word wrap implementation
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0];

    for (const word of words.slice(1)) {
      const testLine = `${currentLine} ${word}`;
      // In production, would measure text width with font
      if (testLine.length * fontSize * 0.5 < maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  }
}