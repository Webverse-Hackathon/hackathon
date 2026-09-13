// Deliberate noise, not a blocker: two inputs with no programmatic label. The
// visible text beside them is not associated with the input, so axe reports
// `label` twice. None of this stands between the agent and checkout.
export function Newsletter() {
  return (
    <section className="newsletter">
      <h2>Get 10% off your first order</h2>
      <div className="newsletter-row">
        <span className="field-hint">Your name</span>
        <input type="text" />
        <span className="field-hint">Your email</span>
        <input type="email" />
        <button type="button">Subscribe</button>
      </div>
    </section>
  );
}
