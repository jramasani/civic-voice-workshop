export const MAX_FEEDBACK_LENGTH = 500;

export function limitFeedback(value) {
  return String(value ?? "").slice(0, MAX_FEEDBACK_LENGTH);
}
