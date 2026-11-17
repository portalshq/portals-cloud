import { describe, expect, it, vi } from "vitest";
import { readProgramMetadata, updateProgramPromotionalCopy } from "./program-metadata.js";

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
