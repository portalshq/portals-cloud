import type { CreateWindowInput, InputWindow, WindowState } from "./types.js";
import type { InteractionRepository } from "./db/repository.js";
import { integer } from "./validation.js";

export interface IWindowManager {
  createWindow(input: CreateWindowInput): Promise<InputWindow>;
  openWindow(windowId: string): Promise<void>;
  closeWindow(windowId: string): Promise<void>;
  getWindow(windowId: string): Promise<InputWindow | null>;
  listWindows(worldId: string, state?: WindowState): Promise<InputWindow[]>;
  startWindowCloser(intervalMs?: number): void;
  stopWindowCloser(): Promise<void>;
}
export class WindowManager implements IWindowManager {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  constructor(
    private readonly repository: InteractionRepository,
    private readonly onError: (error: unknown) => void = (error) =>
      console.error("[interaction windows]", error)
  ) {}
  createWindow(input: CreateWindowInput) {
    return this.repository.createWindow(input);
  }
  openWindow(id: string) {
    return this.repository.updateWindowState(id, "open");
  }
  closeWindow(id: string) {
    return this.repository.updateWindowState(id, "qualifying");
  }
  getWindow(id: string) {
    return this.repository.getWindow(id);
  }
  listWindows(worldId: string, state?: WindowState) {
    return this.repository.listWindows(worldId, state);
  }
  startWindowCloser(intervalMs = 5000): void {
    integer(intervalMs, "intervalMs", 1, 2147483647);
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = this.closeDueWindows()
        .catch(this.onError)
        .finally(() => {
          this.running = undefined;
        });
    }, intervalMs);
    this.timer.unref();
  }
  private async closeDueWindows(): Promise<void> {
    for (const window of await this.repository.listOpenWindowsDueToClose()) {
      await this.repository.transaction(async (r) => {
        const current = await r.getWindow(window.id, true);
        if (
          current?.state === "open" &&
          current.closesAt !== null &&
          Date.parse(current.closesAt) <= (await r.now())
        )
          await r.updateWindowState(current.id, "qualifying");
      });
    }
  }
  async stopWindowCloser(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
  }
}
