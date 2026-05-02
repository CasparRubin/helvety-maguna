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

  it("truncates before <|eot_id|>", () => {
    expect(stripChatArtifacts("Answer<|eot_id|>")).toBe("Answer");
  });

  it("truncates before </s> and chat role markers", () => {
    expect(stripChatArtifacts("Hi</s>")).toBe("Hi");
    expect(stripChatArtifacts("x<|user|>rest")).toBe("x");
    expect(stripChatArtifacts("y<|system|>z")).toBe("y");
  });

  it("truncates before <|start_header_id|>", () => {
    expect(stripChatArtifacts("out<|start_header_id|>")).toBe("out");
  });

  it("truncates at earliest marker among several", () => {
    expect(stripChatArtifacts("ab[/INST]cd<|eot_id|>")).toBe("ab");
    expect(stripChatArtifacts("only<|assistant|>noise")).toBe("only");
  });

  it("truncates at earliest marker and trims trailing space", () => {
    expect(stripChatArtifacts("ok <|assistant|>")).toBe("ok");
  });

  it("removes leading whitespace in plain output", () => {
    expect(stripChatArtifacts(" Hallo Andreas")).toBe("Hallo Andreas");
  });

  it("removes leading whitespace when marker appears later", () => {
    expect(stripChatArtifacts(" Hallo <|assistant|>rest")).toBe("Hallo");
  });
});
