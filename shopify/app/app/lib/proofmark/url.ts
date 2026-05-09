/**
 * URL builders for the ProofMark video ad redirect. Mirrors the Next SDK
 * helpers — same `/c/{creatorHash}` paths, same `return_url` and `sdk=1`
 * query params.
 */

const DEFAULT_VIDEO_AD_URL = 'https://showad.proofmark.io';

export interface VideoAdUrlConfig {
  creatorHash: string;
  videoAdUrl?: string;
}

export function buildVideoAdRedirectUrl(config: VideoAdUrlConfig, returnUrl: string): string {
  const base = config.videoAdUrl || process.env.SHOWAD_VIDEO_URL || DEFAULT_VIDEO_AD_URL;
  const url = new URL(`/c/${encodeURIComponent(config.creatorHash)}`, base);
  url.searchParams.set('return_url', returnUrl);
  url.searchParams.set('sdk', '1');
  return url.toString();
}

export function buildResourceRedirectUrl(
  config: VideoAdUrlConfig,
  projectHash: string,
  resourceHash: string,
  returnUrl: string
): string {
  const base = config.videoAdUrl || process.env.SHOWAD_VIDEO_URL || DEFAULT_VIDEO_AD_URL;
  const url = new URL(
    `/c/${encodeURIComponent(config.creatorHash)}/${encodeURIComponent(projectHash)}/${encodeURIComponent(resourceHash)}`,
    base
  );
  url.searchParams.set('return_url', returnUrl);
  url.searchParams.set('sdk', '1');
  return url.toString();
}
