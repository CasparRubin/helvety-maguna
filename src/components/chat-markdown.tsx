import { code } from "@streamdown/code";
import { Streamdown } from "streamdown";

const STREAMDOWN_PLUGINS = { code } as const;

type ChatMarkdownProps = {
  children: string;
  /** True while this bubble is receiving streamed tokens. */
  isAnimating?: boolean;
};

/** Streaming-safe GFM + code highlighting for chat bubbles. */
export function ChatMarkdown({ children, isAnimating = false }: ChatMarkdownProps) {
  return (
    <Streamdown
      className="text-sm [&_p]:whitespace-pre-wrap [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
      plugins={STREAMDOWN_PLUGINS}
      isAnimating={isAnimating}
      caret={isAnimating ? "block" : undefined}
    >
      {children}
    </Streamdown>
  );
}
