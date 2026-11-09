import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database, openWindow } from "./database.js";

let db: Awaited<ReturnType<typeof database>>;
beforeAll(async () => {
  db = await database();
});
afterAll(async () => {
  await db.close();
});

describe("reassignSubmissionsActor", () => {
  it("re-attributes a guest actor's submissions to the verified user, scoped by world", async () => {
    const worldId = crypto.randomUUID();
    const otherWorldId = crypto.randomUUID();
    const w = await openWindow(db.app, { worldId });
    const other = await openWindow(db.app, { worldId: otherWorldId });

    const mine = await db.app.submissions.submitIntent({
      windowId: w.id,
      actorId: "guest-1",
      idempotencyKey: "g1",
      kind: "custom_prompt",
      payload: { prompt: "hi" },
    });
    const theirs = await db.app.submissions.submitIntent({
      windowId: other.id,
      actorId: "guest-1",
      idempotencyKey: "g2",
      kind: "custom_prompt",
      payload: { prompt: "hi" },
    });
    const unrelated = await db.app.submissions.submitIntent({
      windowId: w.id,
      actorId: "guest-2",
      idempotencyKey: "g3",
      kind: "custom_prompt",
      payload: { prompt: "hi" },
    });

    // Only this world's submissions move; the other world's guest rows and
    // other actors in this world stay put.
    expect(await db.repository.reassignSubmissionsActor(worldId, "guest-1", "user-1")).toBe(1);
    expect((await db.app.submissions.getSubmission(mine.id))?.actorId).toBe("user-1");
    expect((await db.app.submissions.getSubmission(theirs.id))?.actorId).toBe("guest-1");
    expect((await db.app.submissions.getSubmission(unrelated.id))?.actorId).toBe("guest-2");

    // Idempotent: a second call finds nothing left to move.
    expect(await db.repository.reassignSubmissionsActor(worldId, "guest-1", "user-1")).toBe(0);
    expect(await db.repository.reassignSubmissionsActor(worldId, "nobody", "user-1")).toBe(0);
  });
});
