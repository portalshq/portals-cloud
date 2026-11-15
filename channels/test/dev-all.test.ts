import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  assertHostInterfaceAvailable,
  DEVELOPMENT_HOST,
  getDevelopmentProcesses,
  main,
  runDevelopmentProcesses,
} from "../scripts/dev-all.mjs";

describe("development process launcher", () => {
  it("defines the five requested services with distinct client ports", () => {
    const processes = getDevelopmentProcesses({
      channelsDirectory: "/workspace/cloud/channels",
      bearsDirectory: "/workspace/bears-live-app",
    });

    expect(processes.map(({ name }) => name)).toEqual([
      "channels",
      "channels admin",
      "bears client (localhost)",
      "bears dry-run server",
      `bears client (${DEVELOPMENT_HOST})`,
    ]);
    expect(processes[2].args).toContain("5173");
    expect(processes[4].args).toContain("5175");
    expect(processes[4].args).toContain(DEVELOPMENT_HOST);
  });

  it("requires the requested host address to be assigned locally", () => {
    expect(() =>
      assertHostInterfaceAvailable(DEVELOPMENT_HOST, {
        tailscale0: [{ address: DEVELOPMENT_HOST }],
      }),
    ).not.toThrow();

    expect(() =>
      assertHostInterfaceAvailable(DEVELOPMENT_HOST, {
        en0: [{ address: "127.0.0.1" }],
      }),
    ).toThrow(`${DEVELOPMENT_HOST} is not assigned to this machine`);
  });

  it("stops sibling processes when one process exits unexpectedly", async () => {
    const processController = new EventEmitter();
    const spawnedChildren: Array<EventEmitter & { pid: number }> = [];
    const signalledPids: number[] = [];
    const logger = { info: vi.fn(), error: vi.fn() };

    const runResult = runDevelopmentProcesses(
      [
        { name: "first", cwd: "/first", args: ["run", "dev"] },
        { name: "second", cwd: "/second", args: ["run", "dev"] },
      ],
      {
        processController,
        logger,
        spawnProcess: () => {
          const child = Object.assign(new EventEmitter(), { pid: spawnedChildren.length + 10 });
          spawnedChildren.push(child);
          return child;
        },
        killProcessGroup: (pid) => {
          signalledPids.push(pid);
          const child = spawnedChildren.find((spawnedChild) => spawnedChild.pid === pid);
          child?.emit("close", null, "SIGTERM");
        },
      },
    );

    spawnedChildren[0].emit("close", 2, null);

    await expect(runResult).resolves.toBe(2);
    expect(signalledPids).toEqual([11]);
    expect(logger.error).toHaveBeenCalledWith(
      "[dev] first exited unexpectedly (code 2, signal none)",
    );
    expect(processController.listenerCount("SIGINT")).toBe(0);
    expect(processController.listenerCount("SIGTERM")).toBe(0);
  });

  it("forwards Ctrl+C to every running process and returns the interrupt status", async () => {
    const processController = new EventEmitter();
    const child = Object.assign(new EventEmitter(), { pid: 41 });
    const killProcessGroup = vi.fn(() => child.emit("close", null, "SIGINT"));

    const runResult = runDevelopmentProcesses(
      [{ name: "service", cwd: "/service", args: ["run", "dev"] }],
      {
        processController,
        logger: { info: vi.fn(), error: vi.fn() },
        spawnProcess: () => child,
        killProcessGroup,
      },
    );

    processController.emit("SIGINT");

    await expect(runResult).resolves.toBe(130);
    expect(killProcessGroup).toHaveBeenCalledWith(41, "SIGINT");
  });

  it("fails clearly when no process definitions are supplied", () => {
    expect(() => runDevelopmentProcesses([])).toThrow(
      "At least one development process is required.",
    );
  });

  it("prints usage without checking the host or launching services", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const assertHost = vi.fn(() => {
      throw new Error("Host check should not run for --help.");
    });
    const launchProcesses = vi.fn();

    await expect(
      main({ args: ["node", "scripts/dev-all.mjs", "--help"], logger, assertHost, launchProcesses }),
    ).resolves.toBe(0);
    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(assertHost).not.toHaveBeenCalled();
    expect(launchProcesses).not.toHaveBeenCalled();
  });

  it("checks package paths before launching and reports a missing package", async () => {
    const processDefinitions = [{ name: "channels", cwd: "/channels", args: ["run", "dev"] }];
    const logger = { info: vi.fn(), error: vi.fn() };
    const launchProcesses = vi.fn();

    await expect(
      main({
        args: [],
        processDefinitions,
        assertHost: vi.fn(),
        fileExists: vi.fn(() => false),
        launchProcesses,
        logger,
      }),
    ).resolves.toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      "[dev] unable to start the development stack:",
      expect.objectContaining({ message: "Missing package.json for channels at /channels" }),
    );
    expect(launchProcesses).not.toHaveBeenCalled();
  });

  it("launches the validated process definitions", async () => {
    const processDefinitions = [{ name: "channels", cwd: "/channels", args: ["run", "dev"] }];
    const launchProcesses = vi.fn().mockResolvedValue(0);

    await expect(
      main({
        args: [],
        processDefinitions,
        assertHost: vi.fn(),
        fileExists: vi.fn(() => true),
        launchProcesses,
        logger: { info: vi.fn(), error: vi.fn() },
      }),
    ).resolves.toBe(0);
    expect(launchProcesses).toHaveBeenCalledWith(processDefinitions);
  });

  it("returns a failure status when starting a child process throws", async () => {
    const processController = new EventEmitter();
    const logger = { info: vi.fn(), error: vi.fn() };

    await expect(
      runDevelopmentProcesses(
        [{ name: "broken", cwd: "/broken", args: ["run", "dev"] }],
        {
          processController,
          logger,
          spawnProcess: () => {
            throw new Error("npm is unavailable");
          },
        },
      ),
    ).resolves.toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      "[dev] could not start broken:",
      expect.objectContaining({ message: "npm is unavailable" }),
    );
  });

  it("uses a failure status when a child exits successfully but unexpectedly", async () => {
    const child = Object.assign(new EventEmitter(), { pid: 53 });
    const processController = new EventEmitter();
    const killProcessGroup = vi.fn(() => child.emit("close", null, "SIGTERM"));

    const runResult = runDevelopmentProcesses(
      [{ name: "service", cwd: "/service", args: ["run", "dev"] }],
      {
        processController,
        logger: { info: vi.fn(), error: vi.fn() },
        spawnProcess: () => child,
        killProcessGroup,
      },
    );

    child.emit("close", 0, null);

    await expect(runResult).resolves.toBe(1);
    expect(killProcessGroup).not.toHaveBeenCalled();
  });

  it("stops siblings when a child emits a startup error", async () => {
    const processController = new EventEmitter();
    const children: Array<EventEmitter & { pid: number }> = [];
    const logger = { info: vi.fn(), error: vi.fn() };

    const runResult = runDevelopmentProcesses(
      [
        { name: "first", cwd: "/first", args: ["run", "dev"] },
        { name: "second", cwd: "/second", args: ["run", "dev"] },
      ],
      {
        processController,
        logger,
        spawnProcess: () => {
          const child = Object.assign(new EventEmitter(), { pid: children.length + 60 });
          children.push(child);
          return child;
        },
        killProcessGroup: (pid) => {
          children.find((child) => child.pid === pid)?.emit("close", null, "SIGTERM");
        },
      },
    );

    children[0].emit("error", new Error("spawn failed"));

    await expect(runResult).resolves.toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      "[dev] first failed to start:",
      expect.objectContaining({ message: "spawn failed" }),
    );
  });

  it("force-stops child process groups that ignore the graceful signal", async () => {
    vi.useFakeTimers();
    try {
      const processController = new EventEmitter();
      const child = Object.assign(new EventEmitter(), { pid: 71 });
      const signals: string[] = [];
      const runResult = runDevelopmentProcesses(
        [{ name: "service", cwd: "/service", args: ["run", "dev"] }],
        {
          processController,
          logger: { info: vi.fn(), error: vi.fn() },
          spawnProcess: () => child,
          killProcessGroup: (_pid, signal) => {
            signals.push(signal);
            if (signal === "SIGKILL") child.emit("close", null, signal);
          },
        },
      );

      processController.emit("SIGINT");
      await vi.advanceTimersByTimeAsync(5000);

      await expect(runResult).resolves.toBe(130);
      expect(signals).toEqual(["SIGINT", "SIGKILL"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs non-missing process-group signal failures but waits for all siblings", async () => {
    const processController = new EventEmitter();
    const children: Array<EventEmitter & { pid: number }> = [];
    const logger = { info: vi.fn(), error: vi.fn() };
    const runResult = runDevelopmentProcesses(
      [
        { name: "first", cwd: "/first", args: ["run", "dev"] },
        { name: "second", cwd: "/second", args: ["run", "dev"] },
        { name: "third", cwd: "/third", args: ["run", "dev"] },
      ],
      {
        processController,
        logger,
        spawnProcess: () => {
          const child = Object.assign(new EventEmitter(), { pid: children.length + 80 });
          children.push(child);
          return child;
        },
        killProcessGroup: (pid) => {
          if (pid === 81) {
            const error = Object.assign(new Error("permission denied"), { code: "EPERM" });
            throw error;
          }
          children.find((child) => child.pid === pid)?.emit("close", null, "SIGTERM");
        },
      },
    );

    children[0].emit("close", 1, null);
    children[1].emit("close", null, "SIGTERM");

    await expect(runResult).resolves.toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      "[dev] failed to signal second:",
      expect.objectContaining({ code: "EPERM" }),
    );
  });

  it("forwards SIGTERM and returns the conventional termination status", async () => {
    const processController = new EventEmitter();
    const child = Object.assign(new EventEmitter(), { pid: 91 });
    const killProcessGroup = vi.fn((_pid, signal) => child.emit("close", null, signal));
    const runResult = runDevelopmentProcesses(
      [{ name: "service", cwd: "/service", args: ["run", "dev"] }],
      {
        processController,
        logger: { info: vi.fn(), error: vi.fn() },
        spawnProcess: () => child,
        killProcessGroup,
      },
    );

    processController.emit("SIGTERM");

    await expect(runResult).resolves.toBe(143);
    expect(killProcessGroup).toHaveBeenCalledWith(91, "SIGTERM");
  });
});
