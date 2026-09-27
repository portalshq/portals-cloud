import { describe, expect, it } from "vitest";
import { parseJsonObjects } from "./index.js";

describe("parseJsonObjects", () => {
  it("parses adjacent JSON messages across chunks", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode('{"a":1}{"b":')); controller.enqueue(encoder.encode("2}")); controller.close(); },
    });

    const messages = [];
    for await (const message of parseJsonObjects(stream)) messages.push(message);

    expect(messages).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
