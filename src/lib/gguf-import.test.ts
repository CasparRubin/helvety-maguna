import { describe, expect, it } from "vitest";

import { ggufBasename, suggestedImportDisplayName } from "./gguf-import";

describe("gguf-import", () => {
  it("ggufBasename handles posix paths", () => {
    expect(ggufBasename("/Users/me/Models/my-model.gguf")).toBe("my-model.gguf");
  });

  it("ggufBasename handles windows paths", () => {
    expect(ggufBasename("D:\\Models\\my-model.gguf")).toBe("my-model.gguf");
  });

  it("suggestedImportDisplayName strips extension", () => {
    expect(suggestedImportDisplayName("/tmp/Qwen3-8B.Q4_K_M.gguf")).toBe(
      "Qwen3-8B.Q4_K_M",
    );
  });

  it("suggestedImportDisplayName falls back when stem empty", () => {
    expect(suggestedImportDisplayName(".gguf")).toBe("Imported model");
  });
});
