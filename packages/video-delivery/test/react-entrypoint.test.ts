import { describe, expect, it } from "vitest";
import { useProgramOpening } from "../src/react.js";

describe("React entry point", () => {
  it("exports the scheduled program opening hook", () => {
    expect(useProgramOpening).toBeTypeOf("function");
  });
});
