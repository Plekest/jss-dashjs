// Fails fast at process startup instead of silently running with a known,
// versioned-in-the-repo placeholder secret (see spec-security.md Vuln 1).
export function requireSecret(name: string): string {
  const value = process.env[name]
  if (!value || value === 'dev-insecure-secret') {
    console.error(
      `FATAL: ${name} must be set to a strong random value (e.g. \`openssl rand -base64 32\`). ` +
        'Refusing to start with it unset or left at the insecure placeholder.',
    )
    process.exit(1)
  }
  return value
}
