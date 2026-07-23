import { describe, expect, it } from "vitest";

import {
  modelPreservesReasoningTrace,
  shouldPreserveReasoningTrace,
  stripChatArtifacts,
  visibleInferenceOutput,
} from "./inference-output";

const THINK_OPEN = "<" + "think" + ">";
const THINK_CLOSE = "</" + "think" + ">";

describe("stripChatArtifacts", () => {
  it("returns text unchanged when no markers appear", () => {
    expect(stripChatArtifacts("Hello world")).toBe("Hello world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(stripChatArtifacts(" Hallo Andreas ")).toBe("Hallo Andreas");
  });

  it("treats preserveReasoning false the same as omitting the option", () => {
    const raw = `${THINK_OPEN}hidden${THINK_CLOSE}Answer`;
    expect(stripChatArtifacts(raw)).toBe("Answer");
    expect(stripChatArtifacts(raw, { preserveReasoning: false })).toBe("Answer");
  });

  describe("role and control-token truncation (all catalog families)", () => {
    it.each([
      // Qwen ChatML
      ["ok<|im_start|>assistant", "ok"],
      ["ok<|im_end|>", "ok"],
      // Ministral 3 / Kimi
      ["Hi!<|im_system|>", "Hi!"],
      ["Hi!<|im_user|>", "Hi!"],
      ["Hi!<|im_assistant|>", "Hi!"],
      ["Hi!<|im_middle|>", "Hi!"],
      ["Hi!<|im_end|>", "Hi!"],
      // Llama 3
      ["Hi<|begin_of_text|>", "Hi"],
      ["out<|start_header_id|>", "out"],
      ["out<|end_header_id|>", "out"],
      ["Answer<|eot_id|>", "Answer"],
      // Phi-4 / TinyLlama / GLM roles
      ["ok<|assistant|>noise", "ok"],
      ["x<|user|>rest", "x"],
      ["y<|system|>z", "y"],
      ["Hi<|end|>", "Hi"],
      ["Hi</s>", "Hi"],
      ["Hi<s>more", "Hi"],
      // Mistral Instruct
      ["done[INST]more", "done"],
      ["done[/INST]", "done"],
      // Gemma 2
      ["Hi<start_of_turn>user", "Hi"],
      ["Hi<end_of_turn>", "Hi"],
      // Gemma 4
      ["Hallo<turn|>", "Hallo"],
      ["Hi<|turn>user", "Hi"],
      ["Hi<|turn>model", "Hi"],
      ["Hi<|turn>system", "Hi"],
      ["Hi<|turn>", "Hi"],
      // Hunyuan
      ["Hallo<|eos|>", "Hallo"],
      ["Hi<|startoftext|>", "Hi"],
      ["Hi<|extra_0|>", "Hi"],
      ["Hi<|extra_4|>", "Hi"],
      // GLM
      ["Hi[gMASK]", "Hi"],
      ["Hi<sop>", "Hi"],
      ["Hallo/nothink", "Hallo"],
      ["Bye<|endoftext|>", "Bye"],
    ] as const)("truncates %s → %s", (input, expected) => {
      expect(stripChatArtifacts(input)).toBe(expected);
    });

    it("truncates at the earliest marker among several", () => {
      expect(stripChatArtifacts("ab[/INST]cd<|eot_id|>")).toBe("ab");
      expect(stripChatArtifacts("only<|assistant|>noise")).toBe("only");
      expect(stripChatArtifacts("ok <|assistant|>")).toBe("ok");
    });

    it("removes leading whitespace when a marker appears later", () => {
      expect(stripChatArtifacts(" Hallo <|assistant|>rest")).toBe("Hallo");
    });
  });

  describe("thinking off — discard reasoning content", () => {
    it("keeps text after the last Qwen/GLM closing think tag", () => {
      expect(
        stripChatArtifacts(`noise${THINK_OPEN}hidden${THINK_CLOSE}Polished answer`),
      ).toBe("Polished answer");
      expect(
        stripChatArtifacts(
          `${THINK_OPEN}a${THINK_CLOSE}mid${THINK_OPEN}b${THINK_CLOSE}Final`,
        ),
      ).toBe("Final");
    });

    it("truncates before an open think tag when the answer precedes it", () => {
      expect(stripChatArtifacts(`Answer${THINK_OPEN}reasoning`)).toBe("Answer");
    });

    it("hides an incomplete open think block while streaming", () => {
      expect(stripChatArtifacts(`${THINK_OPEN}still thinking`)).toBe("");
      expect(stripChatArtifacts(`partial${THINK_OPEN}more`)).toBe("partial");
    });

    it("strips Gemma thought→closer prefix and keeps the reply", () => {
      expect(
        stripChatArtifacts(
          "<|channel>thought\n<channel|>Hello! How can I help you today?",
        ),
      ).toBe("Hello! How can I help you today?");
      // Pipe variant of the thought header.
      expect(stripChatArtifacts("<|channel|>thought\n<channel|>Hello")).toBe("Hello");
    });

    it("strips bare leading channel closer", () => {
      expect(stripChatArtifacts("<channel|>Hello there")).toBe("Hello there");
      expect(stripChatArtifacts("<|channel|>Answer")).toBe("Answer");
    });

    it("keeps text after channel final", () => {
      expect(
        stripChatArtifacts("<|channel|>thought\nx\n<|channel|>final\nHello there"),
      ).toBe("Hello there");
      expect(stripChatArtifacts("<|channel>thought\nx\n<|channel>final\nHello")).toBe(
        "Hello",
      );
    });

    it("hides incomplete channel thought while streaming", () => {
      expect(stripChatArtifacts("<|channel>thought\n<chan")).toBe("");
      expect(stripChatArtifacts("<|channel>thought")).toBe("");
    });

    it("truncates before a channel thought marker when the answer precedes it", () => {
      expect(stripChatArtifacts("done<|channel|>thought")).toBe("done");
      expect(stripChatArtifacts("done<|channel>thought")).toBe("done");
    });
  });

  describe("thinking on — unwrap tags, keep reasoning prose", () => {
    it("unwraps think tags but keeps reasoning and answer text", () => {
      expect(
        stripChatArtifacts(`hidden${THINK_OPEN}steps${THINK_CLOSE}Answer`, {
          preserveReasoning: true,
        }),
      ).toBe("hiddenstepsAnswer");
    });

    it("unwraps Gemma channel tags but keeps thought and answer", () => {
      expect(
        stripChatArtifacts("<|channel>thought\nsteps\n<channel|>Hello", {
          preserveReasoning: true,
        }),
      ).toBe("steps\nHello");
      // Pipe variant of the thought header.
      expect(
        stripChatArtifacts("<|channel|>thought\nplan\n<|channel|>Hello", {
          preserveReasoning: true,
        }),
      ).toBe("plan\nHello");
    });

    it("does not swallow same-line answer text after a bare channel closer", () => {
      expect(
        stripChatArtifacts("<channel|>Hello there", {
          preserveReasoning: true,
        }),
      ).toBe("Hello there");
    });

    it("unwraps channel analysis and final headers while keeping prose", () => {
      expect(
        stripChatArtifacts("<|channel|>analysis\ncheck\n<|channel|>final\nAnswer", {
          preserveReasoning: true,
        }),
      ).toBe("check\nAnswer");
    });

    it("removes mid-string channel closers without truncating the answer", () => {
      expect(
        stripChatArtifacts("reason then <channel|> answer", {
          preserveReasoning: true,
        }),
      ).toBe("reason then  answer");
    });

    it("still truncates role tokens after unwrapping", () => {
      expect(
        stripChatArtifacts(`${THINK_OPEN}steps${THINK_CLOSE}Answer<|assistant|>noise`, {
          preserveReasoning: true,
        }),
      ).toBe("stepsAnswer");
      expect(
        stripChatArtifacts("thought\n<channel|>Hi<turn|>", {
          preserveReasoning: true,
        }),
      ).toBe("thought\nHi");
      expect(
        stripChatArtifacts("Answer<|im_end|>extra", {
          preserveReasoning: true,
        }),
      ).toBe("Answer");
    });

    it("leaves open think prose visible while streaming (tags only stripped)", () => {
      // Unlike thinking-off, incomplete think content is kept when preserving.
      expect(
        stripChatArtifacts(`${THINK_OPEN}still thinking`, {
          preserveReasoning: true,
        }),
      ).toBe("still thinking");
    });
  });
});

describe("visibleInferenceOutput", () => {
  it("matches stripChatArtifacts for streaming display", () => {
    expect(visibleInferenceOutput(" Hello")).toBe(stripChatArtifacts(" Hello"));
    expect(
      visibleInferenceOutput("<|channel>thought\nplan\n<channel|>Done", {
        preserveReasoning: true,
      }),
    ).toBe(
      stripChatArtifacts("<|channel>thought\nplan\n<channel|>Done", {
        preserveReasoning: true,
      }),
    );
  });

  it("hides channel thought while streaming with thinking off", () => {
    expect(visibleInferenceOutput("<|channel>thought\npartial")).toBe("");
  });
});

describe("modelPreservesReasoningTrace", () => {
  it("returns true for current and legacy DeepSeek R1 catalog ids", () => {
    expect(modelPreservesReasoningTrace("deepseek-r1-0528-qwen3-8b-q4km")).toBe(true);
    // Retired from catalog v9 but still recognized for already-installed GGUFs.
    expect(modelPreservesReasoningTrace("deepseek-r1-distill-qwen-7b-q4km")).toBe(true);
    expect(modelPreservesReasoningTrace("custom_deepseek_r1_import")).toBe(true);
  });

  it("returns true for GLM-Z1 import ids", () => {
    expect(modelPreservesReasoningTrace("glm-z1-9b-import")).toBe(true);
    expect(modelPreservesReasoningTrace("GLM_Z1_9B")).toBe(true);
  });

  it("returns false for polished-output catalog models and empty ids", () => {
    expect(modelPreservesReasoningTrace("qwen3.5-9b-q4km")).toBe(false);
    expect(modelPreservesReasoningTrace("gemma-4-12b-it-q4km")).toBe(false);
    expect(modelPreservesReasoningTrace("gemma-4-26b-a4b-it-q4km")).toBe(false);
    expect(modelPreservesReasoningTrace("glm-4-9b-0414-q4km")).toBe(false);
    expect(modelPreservesReasoningTrace("glm-4.7-flash-q4km")).toBe(false);
    expect(modelPreservesReasoningTrace("hy-mt15-7b-q4km")).toBe(false);
    expect(modelPreservesReasoningTrace("ministral-3-8b-instruct-q4km")).toBe(false);
    expect(modelPreservesReasoningTrace("phi-4-mini-instruct-q4km")).toBe(false);
    expect(modelPreservesReasoningTrace(null)).toBe(false);
    expect(modelPreservesReasoningTrace(undefined)).toBe(false);
    expect(modelPreservesReasoningTrace("")).toBe(false);
  });
});

describe("shouldPreserveReasoningTrace", () => {
  it("follows the Settings toggle for polished models", () => {
    expect(shouldPreserveReasoningTrace("qwen3.5-9b-q4km", true)).toBe(true);
    expect(shouldPreserveReasoningTrace("qwen3.5-9b-q4km", false)).toBe(false);
    expect(shouldPreserveReasoningTrace("gemma-4-12b-it-q4km", true)).toBe(true);
    expect(shouldPreserveReasoningTrace("gemma-4-12b-it-q4km", false)).toBe(false);
    expect(shouldPreserveReasoningTrace("glm-4.7-flash-q4km", true)).toBe(true);
  });

  it("is true for reasoning model ids regardless of the toggle", () => {
    expect(shouldPreserveReasoningTrace("deepseek-r1-0528-qwen3-8b-q4km", false)).toBe(
      true,
    );
    expect(shouldPreserveReasoningTrace("glm-z1-9b-import", false)).toBe(true);
  });
});
