/**
 * URL helpers for redirects.
 */

const DEFAULT_VIDEO_URL = 'https://showad.proofmark.io';

export function resolveVideoAdUrl(videoAdUrl?: string): string {
  return (
    videoAdUrl ||
    (typeof process !== 'undefined' && process.env?.SHOWAD_VIDEO_URL) ||
    DEFAULT_VIDEO_URL
  );
}

/**
 * Build the URL the visitor is sent to in order to watch the gating video ad.
 * Format: `${videoAdUrl}/c/${creatorHash}?return_url=...&sdk=1`.
 */
export function buildVideoAdRedirectUrl(input: {
  videoAdUrl?: string;
  creatorHash: string;
  returnUrl: string;
}): string {
  const url = new URL(`/c/${input.creatorHash}`, resolveVideoAdUrl(input.videoAdUrl));
  url.searchParams.set('return_url', input.returnUrl);
  url.searchParams.set('sdk', '1');
  return url.toString();
}

/** Resource-scoped variant: `/c/<creator>/<project>/<resource>`. */
export function buildResourceRedirectUrl(input: {
  videoAdUrl?: string;
  creatorHash: string;
  projectHash: string;
  resourceHash: string;
  returnUrl: string;
}): string {
  const url = new URL(
    `/c/${input.creatorHash}/${input.projectHash}/${input.resourceHash}`,
    resolveVideoAdUrl(input.videoAdUrl)
  );
  url.searchParams.set('return_url', input.returnUrl);
  url.searchParams.set('sdk', '1');
  return url.toString();
}

/** Return a copy of `url` with the given query param removed. */
export function removeQueryParam(url: string, paramName: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete(paramName);
    return parsed.toString();
  } catch {
    return url;
  }
}
