'use client';

import { useState } from 'react';

// Deliberate noise, not a blocker: two inputs with no programmatic label. The
// visible text beside them is not associated with the input, so axe reports
// `label` twice. None of this stands between the agent and checkout.
//
// PLANTED BLOCKER 3 — state not announced (DECISIONS.md #19). Subscribe works, and
// the confirmation appears on screen, but the paragraph is not a live region, so a
// screen-reader user hears nothing and cannot tell whether they subscribed.
export function Newsletter() {
  const [subscribed, setSubscribed] = useState(false);
  return (
    <section className="newsletter">
      <h2>Get 10% off your first order</h2>
      <div className="newsletter-row">
        <span className="field-hint">Your name</span>
        <input type="text" />
        <span className="field-hint">Your email</span>
        <input type="email" />
        <button type="button" onClick={() => setSubscribed(true)}>Subscribe</button>
      </div>
      <p className="newsletter-status" role="status">{subscribed ? 'Thanks, you are subscribed. Your code is on its way.' : ''}</p>
    </section>
  );
}
