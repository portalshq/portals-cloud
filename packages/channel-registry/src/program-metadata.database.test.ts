import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { readProgramMetadata, updateProgramPromotionalCopy, type ProgramMetadataQuery } from "./program-metadata.js";

describe("central program metadata SQL", () => {
  // PGlite startup is fast alone but can exceed the default timeout when the
  // workspace test suite runs it in parallel with production builds.
  it("migrates existing programs and updates only the selected record", { timeout: 30_000 }, async () => {
    const database = new PGlite();
    try {
      await database.exec("CREATE TABLE programs (id text PRIMARY KEY, name text NOT NULL); INSERT INTO programs VALUES ('bears', 'Bears'), ('other', 'Other');");
      const migration = await readFile(new URL("../sql/001_program_metadata.sql", import.meta.url), "utf8");
      await database.exec(migration);
      await database.exec(migration);
      const query: ProgramMetadataQuery = (sql, values) => database.query(sql, values);
      await updateProgramPromotionalCopy(query, "bears", { description: "A story", tagline: "A tagline" });
      expect(await readProgramMetadata(query, "bears")).toMatchObject({ description: "A story", tagline: "A tagline" });
      expect(await readProgramMetadata(query, "other")).toMatchObject({ description: null, tagline: null });
      expect(await readProgramMetadata(query, "missing")).toBeNull();
    } finally {
      await database.close();
    }
  });
});
