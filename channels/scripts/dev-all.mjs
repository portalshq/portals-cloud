#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEVELOPMENT_HOST = "100.125.2.45";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultChannelsDirectory = path.resolve(scriptDirectory, "..");
const defaultBearsDirectory = path.resolve(defaultChannelsDirectory, "../../bears-live-app");

export function getDevelopmentProcesses({
  channelsDirectory = defaultChannelsDirectory,
  bearsDirectory = defaultBearsDirectory,
} = {}) {
  return [
    {
      name: "channels",
      cwd: channelsDirectory,
      args: ["run", "dev"],
    },
    {
      name: "channels admin",
      cwd: path.join(channelsDirectory, "admin"),
      args: ["run", "dev", "--", "--host", "127.0.0.1", "--strictPort"],
    },
    {
      name: "bears client (localhost)",
      cwd: bearsDirectory,
      args: ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
    },
    {
      name: "bears dry-run server",
      cwd: bearsDirectory,
      args: ["run", "dry-run"],
    },
    {
      name: `bears client (${DEVELOPMENT_HOST})`,
      cwd: bearsDirectory,
      args: ["run", "dev", "--", "--host", DEVELOPMENT_HOST, "--port", "5175", "--strictPort"],
    },
  ];
}

export function assertHostInterfaceAvailable(
  host,
  availableInterfaces = networkInterfaces(),
) {
  const hostIsAssigned = Object.values(availableInterfaces)
    .flatMap((networkInterface) => networkInterface ?? [])
    .some((networkAddress) => networkAddress.address === host);

  if (!hostIsAssigned) {
    throw new Error(
      `${host} is not assigned to this machine. Connect the 100.125.2.45 network interface and retry.`,
    );
  }
}

export function runDevelopmentProcesses(
  processDefinitions,
  {
    spawnProcess = spawn,
    processController = process,
    killProcessGroup = (pid, signal) => process.kill(-pid, signal),
    logger = console,
    shutdownGracePeriodMs = 5000,
  } = {},
) {
  if (processDefinitions.length === 0) {
    throw new Error("At least one development process is required.");
  }

  return new Promise((resolve) => {
    const runningProcesses = [];
    let isStarting = true;
    let isStopping = false;
    let exitCode = 0;
    let forceKillTimer;

    const finishIfStopped = () => {
      const allProcessesClosed = runningProcesses.every(({ isClosed }) => isClosed);
      if (!isStarting && isStopping && allProcessesClosed) {
        clearTimeout(forceKillTimer);
        processController.off("SIGINT", handleInterrupt);
        processController.off("SIGTERM", handleTerminate);
        resolve(exitCode);
      }
    };

    const stopAll = (signal) => {
      if (isStopping) return;
      isStopping = true;
      logger.info(`[dev] stopping remaining processes (${signal})`);

      for (const processRecord of runningProcesses) {
        if (processRecord.isClosed || !processRecord.child.pid) continue;

        try {
          killProcessGroup(processRecord.child.pid, signal);
        } catch (error) {
          if (error.code !== "ESRCH") {
            logger.error(`[dev] failed to signal ${processRecord.definition.name}:`, error);
          }
        }
      }

      forceKillTimer = setTimeout(() => {
        for (const processRecord of runningProcesses) {
          if (processRecord.isClosed || !processRecord.child.pid) continue;
          try {
            killProcessGroup(processRecord.child.pid, "SIGKILL");
          } catch (error) {
            if (error.code !== "ESRCH") {
              logger.error(`[dev] failed to force-stop ${processRecord.definition.name}:`, error);
            }
          }
        }
      }, shutdownGracePeriodMs);
      forceKillTimer.unref();
      finishIfStopped();
    };

    function handleInterrupt() {
      exitCode = 130;
      stopAll("SIGINT");
    }

    function handleTerminate() {
      exitCode = 143;
      stopAll("SIGTERM");
    }

    processController.on("SIGINT", handleInterrupt);
    processController.on("SIGTERM", handleTerminate);

    for (const definition of processDefinitions) {
      try {
        const child = spawnProcess("npm", definition.args, {
          cwd: definition.cwd,
          detached: process.platform !== "win32",
          stdio: "inherit",
        });
        const processRecord = { definition, child, isClosed: false };
        runningProcesses.push(processRecord);

        logger.info(`[dev] started ${definition.name} (pid ${child.pid ?? "starting"})`);
        child.once("error", (error) => {
          logger.error(`[dev] ${definition.name} failed to start:`, error);
          exitCode = 1;
          stopAll("SIGTERM");
        });
        child.once("close", (code, signal) => {
          processRecord.isClosed = true;
          if (!isStopping) {
            exitCode = code === 0 ? 1 : code ?? 1;
            logger.error(
              `[dev] ${definition.name} exited unexpectedly (code ${code ?? "none"}, signal ${signal ?? "none"})`,
            );
            stopAll("SIGTERM");
          }
          finishIfStopped();
        });
      } catch (error) {
        logger.error(`[dev] could not start ${definition.name}:`, error);
        exitCode = 1;
        stopAll("SIGTERM");
        break;
      }
    }

    isStarting = false;
    if (!isStopping) {
      logger.info("[dev] all five process launch requests issued; press Ctrl+C to stop them");
    }
    finishIfStopped();
  });
}

export async function main({
  args = process.argv,
  processDefinitions = getDevelopmentProcesses(),
  assertHost = assertHostInterfaceAvailable,
  fileExists = existsSync,
  launchProcesses = runDevelopmentProcesses,
  logger = console,
} = {}) {
  try {
    if (args.includes("--help")) {
      logger.info("Usage: node scripts/dev-all.mjs");
      logger.info("Starts Channels, admin, the Bears dry-run server, and both Bears clients.");
      return 0;
    }

    assertHost(DEVELOPMENT_HOST);
    for (const definition of processDefinitions) {
      if (!fileExists(path.join(definition.cwd, "package.json"))) {
        throw new Error(`Missing package.json for ${definition.name} at ${definition.cwd}`);
      }
      logger.info(`[dev] ${definition.name}: npm ${definition.args.join(" ")}`);
    }
    return await launchProcesses(processDefinitions);
  } catch (error) {
    logger.error("[dev] unable to start the development stack:", error);
    return 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}
