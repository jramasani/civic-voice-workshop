import { describe, expect, it } from "vitest";
import { limitFeedback, MAX_FEEDBACK_LENGTH } from "./feedback";

describe("feedback character limit", () => {
  it("keeps up to 500 characters and truncates any additional input", () => {
    expect(limitFeedback("a".repeat(MAX_FEEDBACK_LENGTH))).toHaveLength(MAX_FEEDBACK_LENGTH);
    expect(limitFeedback("a".repeat(MAX_FEEDBACK_LENGTH + 1))).toHaveLength(MAX_FEEDBACK_LENGTH);
  });
});
