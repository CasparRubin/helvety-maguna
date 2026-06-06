import { describe, expect, it } from "vitest";

import {
  modelPreservesReasoningTrace,
  stripChatArtifacts,
  visibleInferenceOutput,
} from "./inference-output";

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

  it("keeps text after Qwen3 closing think tag", () => {
    const open = "<" + "think" + ">";
    const close = "</" + "think" + ">";
    expect(stripChatArtifacts(`reasoning${open}hidden${close}Polished answer`)).toBe(
      "Polished answer",
    );
  });

  it("truncates before Qwen3 / DeepSeek-style thinking markers when answer precedes them", () => {
    const open = "<" + "think" + ">";
    expect(stripChatArtifacts(`Answer${open}reasoning`)).toBe("Answer");
    expect(stripChatArtifacts("done<|channel|>thought")).toBe("done");
  });

  it("strips Qwen channel-style thought prefix and keeps the reply", () => {
    expect(
      stripChatArtifacts(
        "<|channel>thought\n<channel|>Hello! How can I help you today?",
      ),
    ).toBe("Hello! How can I help you today?");
  });

  it("keeps text after <|channel|>final", () => {
    expect(
      stripChatArtifacts("<|channel|>thought\nx\n<|channel|>final\nHello there"),
    ).toBe("Hello there");
  });

  it("strips Hunyuan and Phi-4 control tokens", () => {
    expect(stripChatArtifacts("Hallo<|eos|>")).toBe("Hallo");
    expect(stripChatArtifacts("Hi<|end|>")).toBe("Hi");
  });

  it("truncates Mistral 3 im_end echoes", () => {
    const imEnd = "<|" + "im_end" + "|>";
    expect(stripChatArtifacts(`Hi!${imEnd}`)).toBe("Hi!");
  });

  it("hides incomplete channel thought while streaming", () => {
    expect(stripChatArtifacts("<|channel>thought\n<chan")).toBe("");
  });

  it("truncates Gemma 4 turn delimiters", () => {
    expect(stripChatArtifacts("Hallo<turn|>")).toBe("Hallo");
    expect(stripChatArtifacts("Hi<|turn>user")).toBe("Hi");
  });

  it("preserves reasoning when requested", () => {
    const open = "<" + "think" + ">";
    const close = "</" + "think" + ">";
    expect(
      stripChatArtifacts(`hidden${open}steps${close}Answer`, {
        preserveReasoning: true,
      }),
    ).toBe(`hidden${open}steps${close}Answer`);
  });

  it("removes leading whitespace in plain output", () => {
    expect(stripChatArtifacts(" Hallo Andreas")).toBe("Hallo Andreas");
  });

  it("removes leading whitespace when marker appears later", () => {
    expect(stripChatArtifacts(" Hallo <|assistant|>rest")).toBe("Hallo");
  });
});

describe("visibleInferenceOutput", () => {
  it("matches stripChatArtifacts for streaming display", () => {
    expect(visibleInferenceOutput(" Hello")).toBe("Hello");
  });
});

describe("modelPreservesReasoningTrace", () => {
  it("returns true for DeepSeek R1 distill catalog ids", () => {
    expect(modelPreservesReasoningTrace("deepseek-r1-distill-qwen-7b-q4km")).toBe(true);
  });

  it("returns false for polished-output catalog models", () => {
    expect(modelPreservesReasoningTrace("qwen3.5-9b-q4km")).toBe(false);
    expect(modelPreservesReasoningTrace("gemma-4-12b-it-q4km")).toBe(false);
    expect(modelPreservesReasoningTrace(null)).toBe(false);
  });
});
