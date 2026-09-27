import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templates = path.join(root, "skills", "templates");
const output = path.join(root, "skills");
const packageAgents = path.join(root, "docs", "package-agents");
const check = process.argv.includes("--check");

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? files(entryPath) : [entryPath];
  }))).flat();
}

async function packages() {
  const manifests = (await files(path.join(root, "packages"))).filter((file) => path.basename(file) === "package.json");
  return Promise.all(manifests.map(async (file) => JSON.parse(await readFile(file, "utf8"))));
}

function packageFor(doc, manifests) {
  const name = path.basename(doc, ".md");
  const matches = manifests.filter((manifest) => {
    const shortName = manifest.name?.replace("@portalshq/", "");
    return shortName === name || shortName?.replace(/^capability-/, "") === name;
  });

  if (matches.length !== 1) throw new Error(`Expected one package for ${name}, found ${matches.length}.`);
  return matches[0];
}

function packageIndex(docs, manifests, prefix) {
  return docs.map((doc) => {
    const manifest = packageFor(doc, manifests);
    const file = path.basename(doc);
    return `- [${file}](${prefix}${file}) - \`${manifest.name}\` \`${manifest.version}\``;
  });
}

async function expectedFiles() {
  const manifests = await packages();
  const docs = (await files(packageAgents)).filter((file) => path.extname(file) === ".md").sort();
  const index = ["# Package agent modules", "", "Generated from `docs/package-agents/` and current package manifests. Load every module relevant to the requested experience.", "", ...packageIndex(docs, manifests, "./")];

  const result = new Map();
  const appBuilderReferences = path.join(templates, "portals-app-builder.references");
  for (const reference of await files(appBuilderReferences)) {
    result.set(`portals-app-builder/references/${path.relative(appBuilderReferences, reference)}`, await readFile(reference, "utf8"));
  }
  result.set("portals-app-builder/references/package-agents/index.md", `${index.join("\n")}\n`);

  for (const doc of docs) {
    result.set(`portals-app-builder/references/package-agents/${path.basename(doc)}`, await readFile(doc, "utf8"));
  }

  for (const template of (await readdir(templates)).filter((file) => file.endsWith(".md")).sort()) {
    const name = path.basename(template, ".md");
    const content = (await readFile(path.join(templates, template), "utf8"))
      .replaceAll("{{package-agent-index}}", packageIndex(docs, manifests, "references/package-agents/").join("\n"));
    result.set(`${name}/SKILL.md`, content);
  }

  return result;
}

async function run() {
  const generated = await expectedFiles();
  const stale = [];

  for (const [relativePath, content] of generated) {
    const file = path.join(output, relativePath);
    try {
      if ((await readFile(file, "utf8")) !== content) stale.push(relativePath);
    } catch {
      stale.push(relativePath);
    }
  }

  for (const name of ["portals-app-builder", "apple-design"]) {
    const directory = path.join(output, name);
    if (!(await stat(directory).catch(() => undefined))) continue;
    const expected = new Set([...generated.keys()].filter((file) => file.startsWith(`${name}/`)).map((file) => path.join(output, file)));
    for (const file of await files(directory)) if (!expected.has(file)) stale.push(path.relative(output, file));
  }

  if (check) {
    if (stale.length) throw new Error(`Generated skills are stale: ${stale.join(", ")}`);
    return;
  }

  for (const [relativePath, content] of generated) {
    const file = path.join(output, relativePath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }

  for (const name of ["portals-app-builder", "apple-design"]) {
    const directory = path.join(output, name);
    if (await stat(directory).catch(() => undefined)) {
      const expected = new Set([...generated.keys()].filter((file) => file.startsWith(`${name}/`)).map((file) => path.join(output, file)));
      for (const file of await files(directory)) if (!expected.has(file)) await rm(file);
    }
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
