/**
 * Host half of the draft meter bundle.
 *
 * The whole feature is client-side: it reads the live composer draft the
 * Conversation client already publishes and renders a reading below the
 * composer. Nothing here needs a Host service, so this half is intentionally
 * empty — it exists because a bundle patch inserts one entry that owns both
 * halves.
 */

/** No Host-side contribution. */
export function apply() {}
