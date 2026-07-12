import { Router, type IRouter } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  db,
  capabilitiesTable,
  capabilityCommentsTable,
  capabilityVotesTable,
} from "@workspace/db";
import {
  ListCapabilitiesQueryParams,
  ListCapabilitiesResponse,
  GetCapabilityParams,
  GetCapabilityResponse,
  VoteCapabilityParams,
  VoteCapabilityBody,
  VoteCapabilityResponse,
  ListCapabilityCommentsParams,
  ListCapabilityCommentsResponse,
  CreateCapabilityCommentParams,
  CreateCapabilityCommentBody,
  CreateCapabilityCommentResponse,
  GetCatalogSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function withCommentCounts(
  rows: (typeof capabilitiesTable.$inferSelect)[],
) {
  if (rows.length === 0) return [];
  const counts = await db
    .select({
      capabilityId: capabilityCommentsTable.capabilityId,
      commentCount: count(),
    })
    .from(capabilityCommentsTable)
    .groupBy(capabilityCommentsTable.capabilityId);
  const countMap = new Map(counts.map((c) => [c.capabilityId, c.commentCount]));
  return rows.map((row) => ({
    ...row,
    commentCount: countMap.get(row.id) ?? 0,
  }));
}

router.get("/capabilities", async (req, res): Promise<void> => {
  const query = ListCapabilitiesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.category) {
    conditions.push(eq(capabilitiesTable.category, query.data.category));
  }
  if (query.data.status) {
    conditions.push(eq(capabilitiesTable.status, query.data.status));
  }

  const rows = await db
    .select()
    .from(capabilitiesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(capabilitiesTable.votes), capabilitiesTable.id);

  const withCounts = await withCommentCounts(rows);
  res.json(ListCapabilitiesResponse.parse(withCounts));
});

router.get("/capabilities/:id", async (req, res): Promise<void> => {
  const params = GetCapabilityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [capability] = await db
    .select()
    .from(capabilitiesTable)
    .where(eq(capabilitiesTable.id, params.data.id));

  if (!capability) {
    res.status(404).json({ error: "Capability not found" });
    return;
  }

  const [withCount] = await withCommentCounts([capability]);
  res.json(GetCapabilityResponse.parse(withCount));
});

router.post("/capabilities/:id/vote", async (req, res): Promise<void> => {
  const params = VoteCapabilityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = VoteCapabilityBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [capability] = await db
    .select()
    .from(capabilitiesTable)
    .where(eq(capabilitiesTable.id, params.data.id));

  if (!capability) {
    res.status(404).json({ error: "Capability not found" });
    return;
  }

  const insertedVotes = await db
    .insert(capabilityVotesTable)
    .values({
      capabilityId: params.data.id,
      clientId: body.data.clientId,
    })
    .onConflictDoNothing({
      target: [capabilityVotesTable.capabilityId, capabilityVotesTable.clientId],
    })
    .returning();

  let updated = capability;
  if (insertedVotes.length > 0) {
    [updated] = await db
      .update(capabilitiesTable)
      .set({ votes: sql`${capabilitiesTable.votes} + 1` })
      .where(eq(capabilitiesTable.id, params.data.id))
      .returning();
  }

  const [withCount] = await withCommentCounts([updated]);
  res.json(VoteCapabilityResponse.parse(withCount));
});

router.get(
  "/capabilities/:id/comments",
  async (req, res): Promise<void> => {
    const params = ListCapabilityCommentsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [capability] = await db
      .select()
      .from(capabilitiesTable)
      .where(eq(capabilitiesTable.id, params.data.id));

    if (!capability) {
      res.status(404).json({ error: "Capability not found" });
      return;
    }

    const comments = await db
      .select()
      .from(capabilityCommentsTable)
      .where(eq(capabilityCommentsTable.capabilityId, params.data.id))
      .orderBy(desc(capabilityCommentsTable.createdAt));

    res.json(ListCapabilityCommentsResponse.parse(comments));
  },
);

router.post(
  "/capabilities/:id/comments",
  async (req, res): Promise<void> => {
    const params = CreateCapabilityCommentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = CreateCapabilityCommentBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [capability] = await db
      .select()
      .from(capabilitiesTable)
      .where(eq(capabilitiesTable.id, params.data.id));

    if (!capability) {
      res.status(404).json({ error: "Capability not found" });
      return;
    }

    const [comment] = await db
      .insert(capabilityCommentsTable)
      .values({
        capabilityId: params.data.id,
        authorName: body.data.authorName ?? null,
        body: body.data.body,
      })
      .returning();

    res.status(201).json(CreateCapabilityCommentResponse.parse(comment));
  },
);

router.get("/catalog/summary", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      status: capabilitiesTable.status,
      total: count(),
      votes: sql<number>`coalesce(sum(${capabilitiesTable.votes}), 0)`,
    })
    .from(capabilitiesTable)
    .groupBy(capabilitiesTable.status);

  const [{ totalComments }] = await db
    .select({ totalComments: count() })
    .from(capabilityCommentsTable);

  const summary = {
    shippedCount: 0,
    betaCount: 0,
    proposedCount: 0,
    totalVotes: 0,
    totalComments,
  };

  for (const row of rows) {
    const votes = Number(row.votes);
    summary.totalVotes += votes;
    if (row.status === "shipped") summary.shippedCount = row.total;
    else if (row.status === "beta") summary.betaCount = row.total;
    else if (row.status === "proposed") summary.proposedCount = row.total;
  }

  res.json(GetCatalogSummaryResponse.parse(summary));
});

export default router;
