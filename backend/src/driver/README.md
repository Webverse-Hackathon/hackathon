# driver/
Playwright plus raw CDP. The trust boundary that makes the product honest.
Files: index.ts (five exported functions only), cdp.ts, serialize.ts, keys.ts, stabilize.ts
Rules: the Playwright page object never leaves this module. No screenshot, no bounding box, no
coordinate click is exported. serialize.ts is pure and synchronous so it can be unit tested against
recorded trees with no browser.
