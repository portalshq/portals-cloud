/**
 * Window Manager - Manages input window lifecycle.
 *
 * This is a stub implementation. Full implementation coming in Phase 2.
 */
import type {
  CreateWindowInput,
  InputWindow,
  WindowState,
} from "./types.js";

export interface WindowManager {
  createWindow(input: CreateWindowInput): Promise<InputWindow>;
  openWindow(windowId: string): Promise<void>;
  closeWindow(windowId: string): Promise<void>;
  getWindow(windowId: string): Promise<InputWindow | null>;
  listWindows(worldId: string, state?: WindowState): Promise<InputWindow[]>;
  startWindowCloser(intervalMs: number): void;
  stopWindowCloser(): void;
}

export class StubWindowManager implements WindowManager {
  async createWindow(_input: CreateWindowInput): Promise<InputWindow> {
    throw new Error("WindowManager.createWindow not implemented - Phase 2");
  }

  async openWindow(_windowId: string): Promise<void> {
    throw new Error("WindowManager.openWindow not implemented - Phase 2");
  }

  async closeWindow(_windowId: string): Promise<void> {
    throw new Error("WindowManager.closeWindow not implemented - Phase 2");
  }

  async getWindow(_windowId: string): Promise<InputWindow | null> {
    throw new Error("WindowManager.getWindow not implemented - Phase 2");
  }

  async listWindows(_worldId: string, _state?: WindowState): Promise<InputWindow[]> {
    throw new Error("WindowManager.listWindows not implemented - Phase 2");
  }

  startWindowCloser(_intervalMs: number): void {
    throw new Error("WindowManager.startWindowCloser not implemented - Phase 2");
  }

  stopWindowCloser(): void {
    throw new Error("WindowManager.stopWindowCloser not implemented - Phase 2");
  }
}
