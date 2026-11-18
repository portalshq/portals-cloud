/** Public, program-owned content. No credentials or production configuration belong here. */
export interface ProgramMetadata {
  description: string | null;
  tagline: string | null;
  pageTitle: string | null;
  socialSiteName: string | null;
  defaultShareImage: string | null;
  themeColor: string | null;
}

export type ProgramMetadataQuery = (
  sql: string,
  values: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

function fromRow(row: Record<string, unknown>): ProgramMetadata {
  const value = (key: string) => typeof row[key] === "string" ? row[key] as string : null;
  return {
    description: value("description"),
    tagline: value("tagline"),
    pageTitle: value("page_title"),
    socialSiteName: value("social_site_name"),
    defaultShareImage: value("default_share_image"),
    themeColor: value("theme_color"),
  };
}

/** Reads only public metadata for one explicitly identified program. */
export async function readProgramMetadata(
  query: ProgramMetadataQuery,
  programId: string,
): Promise<ProgramMetadata | null> {
  const { rows } = await query(
    `SELECT description, tagline, page_title, social_site_name, default_share_image, theme_color
       FROM programs WHERE id = $1`,
    [programId],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

/** The caller is responsible for authorizing edits to the named program. */
export async function updateProgramPromotionalCopy(
  query: ProgramMetadataQuery,
  programId: string,
  copy: Pick<ProgramMetadata, "description" | "tagline">,
): Promise<ProgramMetadata | null> {
  const { rows } = await query(
    `UPDATE programs SET description = $2, tagline = $3 WHERE id = $1
     RETURNING description, tagline, page_title, social_site_name, default_share_image, theme_color`,
    [programId, copy.description, copy.tagline],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

/** Editable public details of a program. `name` must be non-empty when present;
 *  description/tagline may be empty strings to clear the copy. */
export interface ProgramDetailsPatch {
  name?: string;
  description?: string;
  tagline?: string;
}

export interface ProgramDetails extends ProgramMetadata {
  name: string;
}

/**
 * Updates only the fields present in the patch. The caller is responsible for
 * authorizing edits to the named program (e.g. every channel the program is
 * bound to must be inside the caller's admin scope).
 */
export async function updateProgramDetails(
  query: ProgramMetadataQuery,
  programId: string,
  patch: ProgramDetailsPatch,
): Promise<ProgramDetails | null> {
  const sets: string[] = [];
  const values: unknown[] = [programId];
  for (const [column, field] of [
    ["name", patch.name],
    ["description", patch.description],
    ["tagline", patch.tagline],
  ] as const) {
    if (field === undefined) continue;
    values.push(field);
    sets.push(`${column} = $${values.length}`);
  }
  if (!sets.length) throw new Error("updateProgramDetails requires at least one field");
  const { rows } = await query(
    `UPDATE programs SET ${sets.join(", ")} WHERE id = $1
     RETURNING name, description, tagline, page_title, social_site_name, default_share_image, theme_color`,
    values,
  );
  const row = rows[0];
  return row ? { name: String(row.name), ...fromRow(row) } : null;
}
