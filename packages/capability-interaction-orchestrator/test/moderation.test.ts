import { describe, expect, it } from "vitest";
import { ModerationGateway, type ModerationDecision } from "../src/index.js";
import { sampleSubmission as s } from "./database.js";
const result = (status: ModerationDecision["status"]): ModerationDecision => ({
  id: "custom",
  submissionId: "s1",
  status,
  reasons: [status],
  policyVersion: "custom",
  reviewedBy: "human",
  createdAt: new Date().toISOString(),
});
describe("moderation", () => {
  it.each([
    ["E", "A fine day", "allow"],
    ["E", "What the hell", "reject"],
    ["T", "What the hell", "allow"],
    ["T", "This is shit", "reject"],
    ["T+", "This is shit", "allow"],
    ["T+", "explicit sex", "reject"],
    ["M", "explicit sex", "allow"],
    ["T", "graphic torture", "reject"],
    ["T+", "graphic torture", "allow"],
    ["M", "child pornography", "reject"],
  ] as const)("%s rates %s as %s", async (rating, prompt, status) => {
    const gateway = new ModerationGateway();
    expect(
      (
        await gateway.moderateInput(s("s1", { payload: { prompt } }), {
          contentRating: rating,
        })
      ).status
    ).toBe(status);
    expect(
      (
        await gateway.moderateOutput(
          { nested: [{ body: prompt }] },
          { contentRating: rating }
        )
      ).status
    ).toBe(status);
  });
  it("checks nested strings, Unicode forms and word edges without substring false positives", async () => {
    const gateway = new ModerationGateway(["secret phrase"]);
    expect(
      (
        await gateway.moderateInput(
          s("s1", { payload: { nested: [{ body: "ＳＨＩＴ" }] } }),
          { contentRating: "E" }
        )
      ).status
    ).toBe("reject");
    expect(
      (await gateway.moderateOutput("s\u200bhit", { contentRating: "E" }))
        .status
    ).toBe("reject");
    expect(
      (await gateway.moderateOutput("A secret  phrase", { contentRating: "M" }))
        .status
    ).toBe("reject");
    expect(
      (
        await gateway.moderateOutput("The shell is nice", {
          contentRating: "E",
        })
      ).status
    ).toBe("allow");
  });
  it("uses separate input/output limits and applies world rules to both", async () => {
    const gateway = new ModerationGateway({
      maxInputLength: 5,
      maxOutputLength: 10,
      policyVersion: "custom",
    });
    expect(
      (
        await gateway.moderateInput(
          s("s1", { payload: { prompt: "123456" } }),
          { contentRating: "E" }
        )
      ).status
    ).toBe("reject");
    expect(
      (await gateway.moderateOutput("123456", { contentRating: "E" })).status
    ).toBe("allow");
    expect(
      (await gateway.moderateOutput("12345678901", { contentRating: "E" }))
        .status
    ).toBe("reject");
    const context = {
      contentRating: "E" as const,
      worldRules: [
        { id: "closed", description: "World is closed", validate: () => false },
      ],
    };
    expect((await gateway.moderateInput(s(), context)).reasons).toContain(
      "World rule violated: closed"
    );
    expect((await gateway.moderateOutput("hi", context)).status).toBe("reject");
  });
  it("preserves review and transform decisions, and runs input-only validators on output", async () => {
    const gateway = new ModerationGateway();
    gateway.registerValidator("transform", {
      name: "transform",
      validate: async () => result("transform"),
    });
    expect(
      (await gateway.moderateInput(s(), { contentRating: "M" })).status
    ).toBe("transform");
    gateway.registerCustomValidator({
      name: "review",
      validate: async () => result("review"),
      validateOutput: async () => result("reject"),
    });
    expect(
      (await gateway.moderateInput(s(), { contentRating: "M" })).status
    ).toBe("review");
    expect(
      await gateway.moderateOutput("hi", {
        contentRating: "M",
        submissionId: "original",
        userId: "actor",
      })
    ).toMatchObject({
      submissionId: "original",
      status: "reject",
      reviewedBy: "human",
    });
    gateway.registerCustomValidator({
      name: "allow",
      validate: async () => result("allow"),
    });
    expect(
      (await gateway.moderateInput(s(), { contentRating: "M" })).status
    ).toBe("review");
  });
  it("handles concurrent ratings without shared per-request state", async () => {
    const gateway = new ModerationGateway();
    const [e, m] = await Promise.all([
      gateway.moderateInput(s("e", { payload: { prompt: "hell" } }), {
        contentRating: "E",
      }),
      gateway.moderateInput(s("m", { payload: { prompt: "hell" } }), {
        contentRating: "M",
      }),
    ]);
    expect(e.status).toBe("reject");
    expect(m.status).toBe("allow");
    gateway.setContentRating("M");
    expect(
      (await gateway.moderateInput(s("x", { payload: { prompt: "hell" } })))
        .status
    ).toBe("allow");
    expect((await gateway.moderateOutput("hell")).status).toBe("allow");
    expect(() => gateway.setContentRating("X" as never)).toThrow();
    await expect(
      gateway.moderateInput(s(), { contentRating: "X" as never })
    ).rejects.toThrow();
  });
  it("fails closed on validator failures and malformed decisions", async () => {
    const gateway = new ModerationGateway();
    gateway.registerValidator("broken", {
      name: "broken",
      validate: async () => {
        throw new Error("offline");
      },
    });
    await expect(
      gateway.moderateInput(s(), { contentRating: "E" })
    ).rejects.toThrow("offline");
    gateway.registerValidator("broken", {
      name: "broken",
      validate: async () => ({ ...result("allow"), status: "other" as never }),
    });
    await expect(
      gateway.moderateOutput("Hi", { contentRating: "M" })
    ).rejects.toMatchObject({ code: "INVALID_MODERATION_RESULT" });
    gateway.registerValidator("broken", {
      name: "broken",
      validate: async () => ({ ...result("allow"), reasons: [5] as never }),
    });
    await expect(
      gateway.moderateInput(s(), { contentRating: "M" })
    ).rejects.toThrow("Invalid decision");
    expect(() =>
      gateway.registerValidator("mismatch", {
        name: "wrong",
        validate: async () => result("allow"),
      })
    ).toThrow();
  });
  it.each([
    { blockedTerms: [""] },
    { blockedTerms: "bad" as never },
    { maxInputLength: 0 },
    { maxOutputLength: 65537 },
    { policyVersion: "" },
  ])("rejects malformed configuration %j", (config) => {
    expect(() => new ModerationGateway(config)).toThrow();
  });
  it("allows empty structured output and honors overridden term sets", async () => {
    const gateway = new ModerationGateway({
      mildProfanity: ["heck"],
      strongProfanity: ["blast"],
      explicitTerms: ["adult"],
      graphicViolenceTerms: ["gore"],
      prohibitedTerms: ["forbidden"],
    });
    expect(
      (
        await gateway.moderateOutput(
          { count: 0, empty: null },
          { contentRating: "E" }
        )
      ).status
    ).toBe("allow");
    expect(
      (await gateway.moderateOutput("heck", { contentRating: "E" })).status
    ).toBe("reject");
    expect(
      (await gateway.moderateOutput("blast", { contentRating: "T" })).status
    ).toBe("reject");
  });
});
