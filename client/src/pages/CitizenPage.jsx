import { useState } from "react";
import { submitFeedback } from "../api";
import { limitFeedback, MAX_FEEDBACK_LENGTH } from "../feedback";

export function CitizenPage({ user }) {
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (message.length > MAX_FEEDBACK_LENGTH) {
      setError(`Feedback must be ${MAX_FEEDBACK_LENGTH} characters or fewer.`);
      return;
    }
    try {
      await submitFeedback({ nric: user.nric, name: user.name, message });
      setSubmitted(true);
      setMessage("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <main className="page-shell">
      <div className="page-heading">
        <div className="eyebrow">Public feedback</div>
        <h1>What would you like us to know?</h1>
        <p>Tell us about an issue, an idea, or a positive experience in your community.</p>
      </div>
      <section className="form-card">
        {submitted && <div className="success-banner">Thank you. Your feedback has been received.</div>}
        <form onSubmit={handleSubmit}>
          <label htmlFor="feedback-message">Your feedback
            <textarea id="feedback-message" rows="7" value={message} maxLength={MAX_FEEDBACK_LENGTH} aria-describedby="feedback-count" onChange={(event) => setMessage(limitFeedback(event.target.value))} placeholder="Share your feedback here..." />
          </label>
          <div className="form-footer">
            <div className="muted">
              <span id="feedback-count" aria-live="polite">{message.length}/{MAX_FEEDBACK_LENGTH} characters</span>
              <span> · Please do not include sensitive personal information.</span>
            </div>
            <button className="primary-button">Submit feedback</button>
          </div>
          {error && <p className="error-message">{error}</p>}
        </form>
      </section>
    </main>
  );
}
