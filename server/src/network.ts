// SSRF guard for the adhoc connection test/preview routes (spec-security.md
// Vuln 2): rejects hosts that would let the server be used as a network
// proxy against its own internal/link-local network.
export function isBlockedHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '')

  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true

  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 127) return true // loopback
    if (a === 10) return true // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
    if (a === 192 && b === 168) return true // RFC1918
    if (a === 169 && b === 254) return true // link-local (incl. cloud metadata)
    return false
  }

  if (h.startsWith('fe80:') || h.startsWith('fc00:') || h.startsWith('fd00:')) return true // IPv6 link-local/unique-local

  return false
}
