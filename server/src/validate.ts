// Deliberately simple format check — not RFC 5322-exhaustive, just enough to
// reject non-email garbage/HTML before it's used as a send-to address
// (spec-security.md Vuln 3).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_RE.test(value)
}
