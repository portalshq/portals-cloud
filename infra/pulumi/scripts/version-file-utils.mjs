import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

function fail(message, cause) {
  const detail = cause instanceof Error ? `: ${cause.message}` : "";
  throw new Error(`${message}${detail}`);
}

export function readYamlDocument(file) {
  let document;
  try {
    document = YAML.parseDocument(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`cannot read ${file}`, error);
  }
  if (document.errors.length > 0) {
    throw new Error(
      `YAML parse errors in ${file}; refusing to modify it:\n` +
        document.errors.map((error) => `- ${error.message}`).join("\n"),
    );
  }
  if (!YAML.isMap(document.contents)) {
    throw new Error(`${file} must contain a non-empty YAML mapping`);
  }
  return document;
}

export function readJsonObject(file) {
  let value;
  try {
    const text = fs.readFileSync(file, "utf8");
    if (text.trim() === "") throw new Error("file is empty");
    value = JSON.parse(text);
  } catch (error) {
    fail(`invalid JSON in ${file}; refusing to modify it`, error);
  }
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${file} must contain a JSON object`);
  }
  return value;
}

export function atomicWriteFile(file, text) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error(`refusing to write empty content to ${file}`);
  }
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let originalMode = 0o644;
  try {
    originalMode = fs.statSync(file).mode & 0o777;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    const descriptor = fs.openSync(temporary, "wx", originalMode);
    try {
      fs.writeFileSync(descriptor, text, "utf8");
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function atomicWriteJson(file, value) {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`refusing to write a non-object JSON value to ${file}`);
  }
  const text = `${JSON.stringify(value, null, 2)}\n`;
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("serialized value is not an object");
    }
  } catch (error) {
    fail(`refusing to write invalid JSON to ${file}`, error);
  }
  atomicWriteFile(file, text);
}

export function atomicWriteYaml(file, document) {
  const text = document.toString({ lineWidth: 0 });
  const parsed = YAML.parseDocument(text);
  if (parsed.errors.length > 0 || !YAML.isMap(parsed.contents)) {
    throw new Error(`refusing to write invalid YAML to ${file}`);
  }
  atomicWriteFile(file, text);
}
