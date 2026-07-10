import dns from 'node:dns'

// Parses a hostname that is actually a disguised IPv4 literal: pure decimal
// integer ("2130706433"), pure hex ("0x7f000001"), or dotted-quad with
// octal/hex octets ("0177.0.0.1") — all classic SSRF-blocklist-bypass forms
// that resolve to the same address as their canonical dotted-decimal form.
// Returns null if `host` isn't one of these numeric forms.
function parseIPv4Literal(host: string): [number, number, number, number] | null {
  const toOctets = (n: number): [number, number, number, number] => [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ]

  if (/^\d+$/.test(host)) {
    const n = Number(host)
    return n <= 0xffffffff ? toOctets(n) : null
  }
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const n = Number(host)
    return n <= 0xffffffff ? toOctets(n) : null
  }

  const parts = host.split('.')
  if (parts.length !== 4) return null
  const bytes = parts.map((p) => {
    if (/^0x[0-9a-f]+$/i.test(p)) return Number(p)
    if (/^0[0-7]+$/.test(p)) return parseInt(p, 8)
    if (/^\d{1,3}$/.test(p)) return Number(p)
    return NaN
  })
  if (bytes.some((b) => Number.isNaN(b) || b > 255)) return null
  return bytes as [number, number, number, number]
}

function isBlockedIPv4(bytes: [number, number, number, number]): boolean {
  const [a, b] = bytes
  if (a === 127) return true // loopback
  if (a === 10) return true // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 169 && b === 254) return true // link-local (incl. cloud metadata)
  return false
}

// SSRF guard applied at the query sink (postgres.ts) so every call path —
// persisted connections, adhoc test/preview, scheduled refresh — is covered
// by construction (spec-security.md Vuln 2).
export function isBlockedHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '')

  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true

  // IPv4-mapped IPv6 ("::ffff:127.0.0.1" or "::ffff:7f00:1")
  const mapped = h.match(/^::ffff:(.+)$/)
  if (mapped) {
    const inner = mapped[1]
    if (inner.includes('.')) {
      const parsed = parseIPv4Literal(inner)
      return parsed ? isBlockedIPv4(parsed) : false
    }
    const groups = inner.split(':')
    if (groups.length === 2 && groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) {
      const g0 = parseInt(groups[0], 16)
      const g1 = parseInt(groups[1], 16)
      return isBlockedIPv4([(g0 >> 8) & 0xff, g0 & 0xff, (g1 >> 8) & 0xff, g1 & 0xff])
    }
    return false
  }

  const parsed = parseIPv4Literal(h)
  if (parsed) return isBlockedIPv4(parsed)

  if (h.startsWith('fe80:') || h.startsWith('fc00:') || h.startsWith('fd00:')) return true // IPv6 link-local/unique-local

  return false
}

// Defense in depth against DNS rebinding: resolves `host` right before use
// and checks the resolved address(es) too, not just the literal string.
// This narrows (but — since the actual pg connect happens moments later
// and re-resolves independently — cannot fully close) the TOCTOU window
// where a hostname answers a safe IP now and an internal one at connect time.
export async function assertHostAllowed(host: string): Promise<void> {
  if (isBlockedHost(host)) throw new Error('host not allowed')
  try {
    const addresses = await dns.promises.lookup(host, { all: true })
    if (addresses.some((a) => isBlockedHost(a.address))) throw new Error('host not allowed')
  } catch (err) {
    if (err instanceof Error && err.message === 'host not allowed') throw err
    // Resolution errors aren't a security concern here — let the real
    // connection attempt surface its own (clearer) error.
  }
}
