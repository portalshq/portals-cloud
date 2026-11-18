import { describe, expect, it, vi } from "vitest";
import { readProgramMetadata, updateProgramDetails, updateProgramPromotionalCopy } from "./program-metadata.js";

describe("program metadata", () => {
  it("reads only the requested program and maps the public fields", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ description: "A story", tagline: "Come along", page_title: "Story", social_site_name: "Stories", default_share_image: "/story.png", theme_color: "#123456" }] });
    await expect(readProgramMetadata(query, "program-1")).resolves.toEqual({
      description: "A story", tagline: "Come along", pageTitle: "Story", socialSiteName: "Stories", defaultShareImage: "/story.png", themeColor: "#123456",
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE id = $1"), ["program-1"]);
  });

  it("preserves intentionally empty copy and returns null for a missing program", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ description: "", tagline: "" }] }).mockResolvedValueOnce({ rows: [] });
    await expect(updateProgramPromotionalCopy(query, "program-1", { description: "", tagline: "" })).resolves.toMatchObject({ description: "", tagline: "" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE programs"), ["program-1", "", ""]);
    await expect(readProgramMetadata(query, "missing")).resolves.toBeNull();
  });
});

describe("updateProgramDetails", () => {
  it("updates only the provided fields", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ name: "Bears Live", description: "A story", tagline: "Come along" }] });
    await expect(updateProgramDetails(query, "program-1", { name: "Bears Live", description: "A story" })).resolves.toMatchObject({
      name: "Bears Live", description: "A story", tagline: "Come along",
    });
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("name = $2");
    expect(sql).toContain("description = $3");
    expect(sql).not.toContain("tagline =");
    expect(values).toEqual(["program-1", "Bears Live", "A story"]);
  });

  it("clears copy with empty strings and returns null for a missing program", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ name: "Bears Live", description: "", tagline: "" }] }).mockResolvedValueOnce({ rows: [] });
    await expect(updateProgramDetails(query, "program-1", { tagline: "" })).resolves.toMatchObject({ tagline: "" });
    expect(query.mock.calls[0][1]).toEqual(["program-1", ""]);
    await expect(updateProgramDetails(query, "missing", { name: "X" })).resolves.toBeNull();
  });

  it("rejects an empty patch", async () => {
    const query = vi.fn();
    await expect(updateProgramDetails(query, "program-1", {})).rejects.toThrowError("at least one field");
    expect(query).not.toHaveBeenCalled();
  });
});
