// ============================================================
//  AUDIT LOG — minimal technical events only
//
//  Privacy rules enforced here:
//    · never log audio
//    · never log transcripts or the activation phrase
//    · never log raw tokens
//    · log only event name, outcome, account id (opaque) and time
//
//  The log is in-memory and capped. If you need it persisted,
//  ship it to your own log sink — do not add personal data.
// ============================================================

const MAX_ENTRIES = 200;
const entries = [];

/**
 * @param {string} event technical event name, e.g. "panel.activation"
 * @param {string} outcome "granted" | "denied" | "ok" | "rejected"
 * @param {object} [meta] optional, must not contain audio/transcripts
 */
export function audit(event, outcome, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    outcome,
    accountId: typeof meta.accountId === "string" ? meta.accountId : null,
    room: typeof meta.room === "string" ? meta.room : null,
    // Only a coarse reason code — never free text that could leak data.
    reason: typeof meta.reason === "string" ? meta.reason.slice(0, 48) : null,
  };
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  console.log(
    `[audit] ${entry.ts} ${entry.event} -> ${entry.outcome}` +
      (entry.reason ? ` (${entry.reason})` : "") +
      (entry.accountId ? ` account=${entry.accountId}` : ""),
  );
  return entry;
}

export function readAudit() {
  return entries.slice();
}
