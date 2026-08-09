export function trustedOrigins(): string[] {
  return (
    process.env.CORS_ORIGINS ??
    process.env.CORS_ORIGIN ??
    process.env.WEB_ORIGIN ??
    'http://localhost:4200'
  )
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => origin !== null);
}

export function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}
