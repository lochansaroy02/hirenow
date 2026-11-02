/**
 * Only same-site paths are honoured as a post-login destination. "//evil.com" and
 * "/\evil.com" are treated by browsers as other hosts, so they are rejected along
 * with absolute URLs.
 */
export function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }

  return value;
}
