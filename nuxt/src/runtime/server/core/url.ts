export function buildVideoAdRedirectUrl(
  videoAdUrl: string,
  creatorHash: string,
  returnUrl: string,
): string {
  const url = new URL(videoAdUrl)
  url.pathname = `/c/${creatorHash}`
  url.searchParams.set('return_url', returnUrl)
  url.searchParams.set('sdk', '1')
  return url.toString()
}

export function stripRedirectTicket(rawUrl: string): string {
  const url = new URL(rawUrl)
  url.searchParams.delete('redirect_ticket')
  return url.pathname + (url.search || '') + (url.hash || '')
}
