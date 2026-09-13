/**
 * @ally/shared — the seam between the frontend and the backend.
 *
 * If the frontend and the backend both know about a thing, its type is defined
 * HERE and imported by both. Never duplicate an interface across the two sides.
 *
 * Every type is derived from a zod schema in ./schemas.ts, so runtime
 * validation and compile-time types cannot drift. Add a new shape there as a
 * schema first, then `export type X = z.infer<typeof XSchema>` beside it.
 *
 * Changing a type in this file requires telling the other two tracks before you
 * push it. See docs/13-TEAM-SPLIT.md.
 */

// The .js extension is required: this package is consumed as Node ESM from dist.
export * from './schemas.js';
