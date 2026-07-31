/**
 * Error classification drives the scheduler: whether an item is retried, failed
 * permanently, or whether the whole worker should stand down until tomorrow.
 */

export const FAILURE_KIND = {
  /** Transient — network blip, 5xx. Retry with backoff. */
  TRANSIENT: "transient",
  /** Key missing/invalid/revoked. Retrying cannot help; stop the worker. */
  AUTH: "auth",
  /** Content was rejected (e.g. flagged). Retrying the same body cannot help. */
  CONTENT: "content",
  /** Daily allowance is gone. Retry after the UTC day rolls over. */
  QUOTA: "quota",
  /** Caller built an invalid request. A bug or bad input, never retried. */
  VALIDATION: "validation",
};

const CODE_KINDS = new Map([
  ["220003", FAILURE_KIND.AUTH],
  ["220009", FAILURE_KIND.QUOTA],
  ["20002", FAILURE_KIND.CONTENT],
  ["20022", FAILURE_KIND.CONTENT],
  // Too many distinct cashtags in one post. Observed at 4; 3 publishes fine.
  ["220095", FAILURE_KIND.CONTENT],
]);

export class SquareApiError extends Error {
  constructor(message, { code, httpStatus, kind, endpoint } = {}) {
    super(message);
    this.name = "SquareApiError";
    this.code = code ?? null;
    this.httpStatus = httpStatus ?? null;
    this.endpoint = endpoint ?? null;
    this.kind = kind ?? classify({ code, httpStatus });
  }
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.kind = FAILURE_KIND.VALIDATION;
  }
}

/**
 * Maps a business code (preferred) or bare HTTP status onto a failure kind.
 * Unknown business codes are treated as permanent content failures rather than
 * retried: an unrecognised rejection repeated 5 times is 5 chances to
 * double-post, and burns quota either way.
 */
export function classify({ code, httpStatus } = {}) {
  if (code && CODE_KINDS.has(String(code))) return CODE_KINDS.get(String(code));
  if (code) return FAILURE_KIND.CONTENT;

  if (httpStatus === 401 || httpStatus === 403) return FAILURE_KIND.AUTH;
  if (httpStatus === 429) return FAILURE_KIND.QUOTA;
  if (httpStatus >= 500) return FAILURE_KIND.TRANSIENT;
  if (httpStatus >= 400) return FAILURE_KIND.CONTENT;

  return FAILURE_KIND.TRANSIENT;
}

export function isRetryable(err) {
  return (err?.kind ?? FAILURE_KIND.TRANSIENT) === FAILURE_KIND.TRANSIENT;
}
