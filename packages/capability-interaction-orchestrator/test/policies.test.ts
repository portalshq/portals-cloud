import { describe, expect, it } from "vitest";
import {
  ArbitrationEngine,
  BatchPolicy,
  ExecutionBridge,
  FIFOPolicy,
  FirstAcceptedPolicy,
  HostSelectionPolicy,
  ParallelBranchesPolicy,
  PluralityPolicy,
  RankedPolicy,
  createExecutionBridge,
} from "../src/index.js";
import { sampleSubmission as s, sampleWindow as w } from "./database.js";

describe("arbitration through its selection interface", () => {
  const engine = new ArbitrationEngine();
  it.each([
    ["fifo", ["a", "b"]],
    ["first_accepted", ["a"]],
    ["parallel_branches", ["a", "b"]],
  ] as const)(
    "%s uses deterministic admission order and capacity",
    async (name, ids) => {
      const submissions = [
        s("c", { admissionSequence: 3 }),
        s("b", { admissionSequence: 2 }),
        s("a"),
      ];
      const result = await engine.resolve(
        w({ arbitrationPolicy: name }),
        submissions
      );
      expect(result.selectedSubmissionIds).toEqual(ids);
      expect(submissions[0].id).toBe("c");
      expect(result.resolutionSequence).toBe(0);
    }
  );
  it("plurality groups by target, counts distinct actors and breaks ties deterministically", async () => {
    const submissions = [
      s("a", { kind: "vote", payload: { option: "A" }, admissionSequence: 1 }),
      s("b", {
        kind: "vote",
        payload: { targetId: "B" },
        admissionSequence: 2,
      }),
      s("c", {
        kind: "vote",
        payload: { targetId: "B" },
        admissionSequence: 3,
      }),
      s("d", {
        kind: "vote",
        payload: { option: "A" },
        admissionSequence: 4,
        actorId: "a",
      }),
    ];
    const result = await engine.resolve(
      w({ arbitrationPolicy: "plurality", maxSelectedInputs: 1 }),
      submissions
    );
    expect(result.selectedSubmissionIds).toEqual(["b"]);
    expect(result.appMetadata.voteCounts).toEqual([
      { submissionId: "b", votes: 2 },
      { submissionId: "a", votes: 1 },
    ]);
    const tied = await engine.resolve(
      w({ arbitrationPolicy: "plurality", maxSelectedInputs: 1 }),
      submissions.slice(0, 2)
    );
    expect(tied.selectedSubmissionIds).toEqual(["a"]);
  });
  it("ranked uses only trusted config, with window values taking precedence over defaults", async () => {
    const e = new ArbitrationEngine();
    e.setPolicyConfig("ranked", { priorities: { a: 100 } });
    const result = await e.resolve(
      w({
        arbitrationPolicy: "ranked",
        arbitrationPolicyConfig: { priorities: { b: 10 } },
        maxSelectedInputs: 1,
      }),
      [s("a", { payload: { prompt: "Hi", priority: 999 } }), s("b")]
    );
    expect(result.selectedSubmissionIds).toEqual(["b"]);
  });
  it("batch greedily combines nonconflicting targets within capacity", async () => {
    const result = await engine.resolve(w({ arbitrationPolicy: "batch" }), [
      s("a", { targetEntityIds: ["x"] }),
      s("b", { admissionSequence: 2, targetEntityIds: ["x", "y"] }),
      s("c", { admissionSequence: 3, targetEntityIds: ["z"] }),
      s("d", { admissionSequence: 4 }),
    ]);
    expect(result.selectedSubmissionIds).toEqual(["a", "c"]);
    expect(result.rejectedSubmissionIds).toEqual(["b", "d"]);
  });
  it("host selection rejects missing, duplicate, foreign and over-capacity choices", async () => {
    await expect(
      engine.resolve(w({ arbitrationPolicy: "host_selection" }), [s()])
    ).rejects.toMatchObject({ code: "HOST_SELECTION_REQUIRED" });
    for (const ids of [["s1", "s1"], ["foreign"], ["s1", "s2", "s3"]])
      await expect(
        engine.resolve(
          w({
            arbitrationPolicy: "host_selection",
            arbitrationPolicyConfig: { selectedSubmissionIds: ids },
          }),
          [s()]
        )
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const result = await engine.resolve(
      w({
        arbitrationPolicy: "host_selection",
        arbitrationPolicyConfig: { selectedSubmissionIds: ["b"] },
      }),
      [s("a"), s("b")]
    );
    expect(result.selectedSubmissionIds).toEqual(["b"]);
    expect(
      (
        await engine.resolve(
          w({
            arbitrationPolicy: "host_selection",
            arbitrationPolicyConfig: { selectedSubmissionIds: [] },
          }),
          [s()]
        )
      ).selectedSubmissionIds
    ).toEqual([]);
  });
  it.each([
    "message",
    "custom_prompt",
    "world_action",
    "entity_mutation",
    "vote",
    "create_object",
    "create_branch",
  ] as const)("maps %s into a complete execution interaction", async (kind) => {
    const result = await engine.resolve(w(), [
      s("s", {
        kind,
        targetEntityIds: ["object"],
        payload: {
          prompt: "hello",
          message: "hi",
          action: "move",
          params: { x: 1 },
          option: "A",
          object: { name: "ball" },
          name: "remix",
        },
      }),
    ]);
    expect(result.appMetadata.videoProviderInteractions).toHaveLength(1);
    const entry = (
      result.appMetadata.videoProviderInteractions as Array<{
        interaction: { type: string; payload: Record<string, unknown> };
      }>
    )[0];
    expect(entry.interaction.payload.type).toBe(entry.interaction.type);
  });
  it("rejects noneligible, mixed-window, duplicate and invalid-sequence inputs", async () => {
    for (const submissions of [
      [s("x", { status: "rejected" })],
      [s("x", { windowId: "other" })],
      [s(), s()],
      [s("x", { admissionSequence: 0 })],
    ])
      await expect(engine.resolve(w(), submissions)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
    await expect(
      engine.resolve(w({ arbitrationPolicy: "missing" as never }), [])
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(() => engine.setPolicyConfig("missing", {})).toThrow();
    expect(() => engine.registerPolicy("ranked", new FIFOPolicy())).toThrow();
    expect(() => engine.setPolicyConfig("fifo", [] as never)).toThrow();
  });
  it("rejects invalid policy results and malformed trusted ranking config", async () => {
    const e = new ArbitrationEngine();
    e.registerPolicy("fifo", {
      name: "fifo",
      resolve: (window, submissions) => ({
        ...new FIFOPolicy().resolve(window, submissions),
        selectedSubmissionIds: ["foreign"],
      }),
    });
    await expect(e.resolve(w(), [s()])).rejects.toMatchObject({
      code: "INVALID_POLICY_RESULT",
    });
    await expect(
      engine.resolve(
        w({
          arbitrationPolicy: "ranked",
          arbitrationPolicyConfig: { priorities: { a: "high" } },
        }),
        [s()]
      )
    ).rejects.toThrow("finite");
    await expect(
      engine.resolve(w({ arbitrationPolicy: "plurality" }), [s()])
    ).rejects.toThrow("Plurality");
  });
  it("supports all built-in policy adapters directly and handles empty input", () => {
    for (const policy of [
      new FIFOPolicy(),
      new FirstAcceptedPolicy(),
      new PluralityPolicy(),
      new RankedPolicy(),
      new BatchPolicy(),
      new ParallelBranchesPolicy(),
      new HostSelectionPolicy(),
    ])
      expect(
        policy.resolve(
          w({ arbitrationPolicyConfig: { selectedSubmissionIds: [] } }),
          []
        ).selectedSubmissionIds
      ).toEqual([]);
    expect(
      new FIFOPolicy().resolve(w(), [s("b"), s("a")]).selectedSubmissionIds
    ).toEqual(["a", "b"]);
  });
  it("dispatches stable idempotency keys and independent parallel branch sessions", async () => {
    const result = await engine.resolve(
      w({ arbitrationPolicy: "parallel_branches" }),
      [s("a"), s("b")]
    );
    result.status = "executing";
    const applied = new Set<string>();
    const sessions = new Set<string>();
    const bridge = createExecutionBridge({
      videoProviderSessionId: "canonical",
      sessionForBranch: async (id) => id,
      videoProvider: {
        sendInteraction: async (session, _interaction, options) => {
          applied.add(options.idempotencyKey);
          sessions.add(session);
        },
      },
    });
    await bridge.executeResolution(result);
    await bridge.executeResolution(result);
    expect(applied.size).toBe(2);
    expect(sessions.size).toBe(2);
    await expect(
      new ExecutionBridge({
        videoProviderSessionId: "canonical",
        videoProvider: { sendInteraction: async () => {} },
      }).executeResolution(result)
    ).rejects.toThrow("sessionForBranch");
  });
  it("fails before dispatch on malformed resolutions and propagates execution failures", async () => {
    const result = await engine.resolve(w(), [s()]);
    const bridge = new ExecutionBridge({
      videoProviderSessionId: "session",
      videoProvider: {
        sendInteraction: async () => {
          throw new Error("unavailable");
        },
      },
    });
    await expect(bridge.executeResolution(result)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    result.status = "executing";
    await expect(bridge.executeResolution(result)).rejects.toThrow(
      "unavailable"
    );
    await expect(
      bridge.executeResolution({ ...result, appMetadata: {} })
    ).rejects.toThrow("every selected");
    const entry = (result.appMetadata.videoProviderInteractions as object[])[0];
    await expect(
      bridge.executeResolution({
        ...result,
        selectedSubmissionIds: ["s1", "s2"],
        appMetadata: { videoProviderInteractions: [entry, entry] },
      })
    ).rejects.toThrow("Invalid execution");
    await expect(
      bridge.executeResolution({
        ...result,
        appMetadata: {
          videoProviderInteractions: [
            {
              submissionId: "s1",
              interaction: { type: "invalid", payload: {} },
            },
          ],
        },
      })
    ).rejects.toThrow("Invalid execution");
  });
});
