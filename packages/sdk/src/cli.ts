#!/usr/bin/env node
import { Command } from "commander";
import { loadManifest } from "./channel-manifest-loader.js";

const program = new Command();
program.name("nap").description("Portals Platform developer CLI");

program
  .command("channel init <name>")
  .description("Scaffold a new channel manifest")
  .action((name: string) => {
    // TODO: write a starter channel.yaml with the four reusable capabilities
    // pre-listed (realtime-fanout, video-delivery or text-image-delivery,
    // identity, narrative-engine-adapter) so a new channel type is a config
    // edit, not a new integration.
    console.log(`TODO: scaffold ${name}/channel.yaml`);
  });

program
  .command("channel validate <manifestPath>")
  .description("Validate a channel manifest against @portalshq/contracts")
  .action((manifestPath: string) => {
    const manifest = loadManifest(manifestPath);
    console.log(`Valid manifest: ${manifest.metadata.name}`);
  });

program
  .command("channel deploy <manifestPath>")
  .description("Deploy a channel to the runtime")
  .action((manifestPath: string) => {
    // TODO: POST manifest to runtime-core's session-orchestrator deploy endpoint
    console.log("TODO: wire deploy to runtime-core API");
  });

program.parse();
