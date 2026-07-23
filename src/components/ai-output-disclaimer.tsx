import { Link } from "react-router-dom";

/** Short accuracy notice under AI workspaces; full terms live on Settings. */
export const AI_OUTPUT_DISCLAIMER_LEAD =
  "Maguna can make mistakes. Check important info.";

export const AI_OUTPUT_DISCLAIMER_TERMS_HREF = "/settings#terms-disclaimers";

export const AI_OUTPUT_DISCLAIMER_TERMS_ANCHOR = "terms-disclaimers";

/** Short accuracy notice under AI workspaces; links to full Settings terms. */
export function AiOutputDisclaimer() {
  return (
    <p className="text-xs text-muted-foreground" data-testid="ai-output-disclaimer">
      {AI_OUTPUT_DISCLAIMER_LEAD}{" "}
      <Link
        to={AI_OUTPUT_DISCLAIMER_TERMS_HREF}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        Terms
      </Link>
    </p>
  );
}
