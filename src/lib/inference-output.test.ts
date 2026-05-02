import { describe, expect, it } from "vitest";

import { stripChatArtifacts } from "./inference-output";

describe("stripChatArtifacts", () => {
  it("returns text unchanged when no markers appear", () => {
    expect(stripChatArtifacts("Hello world")).toBe("Hello world");
  });

  it("truncates before first assistant-style marker", () => {
    expect(stripChatArtifacts("ok<|assistant|>noise")).toBe("ok");
  });

  it("truncates before [/INST] echo", () => {
    expect(stripChatArtifacts("done[/INST]")).toBe("done");
  });
});
