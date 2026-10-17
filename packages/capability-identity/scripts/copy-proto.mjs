import { copyFile, mkdir } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const source = new URL("../../infra/lore/lore/lore-proto/proto/auth_api.proto", root);
const snapshot = new URL("src/proto/auth_api.proto", root);
await mkdir(new URL("src/proto/", root), { recursive: true });
await mkdir(new URL("dist/proto/", root), { recursive: true });
try {
  await copyFile(source, snapshot);
} catch (error) {
  // Clean checkouts may omit the lore submodule. Use the checked-in protocol snapshot.
  if (error.code !== "ENOENT") throw error;
}
await copyFile(snapshot, new URL("dist/proto/auth_api.proto", root));
