import type { ClaimTicketResponse, ValidateTokenResponse } from '../../../types'

export interface BackendConfig {
  apiBaseUrl: string
  apiKey: string
  creatorHash: string
  redirectSecret: string
}

export class TicketClaimError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'TicketClaimError'
    this.status = status
  }
}

export async function claimTicket(
  cfg: BackendConfig,
  ticketId: string,
): Promise<ClaimTicketResponse> {
  const url = `${cfg.apiBaseUrl}/api/redirect-ticket/${encodeURIComponent(ticketId)}/claim`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Redirect-Ticket-Secret': cfg.redirectSecret,
      'X-ShowAd-API-Key': cfg.apiKey,
      'X-ShowAd-Creator-Hash': cfg.creatorHash,
    },
    body: JSON.stringify({ creator_hash: cfg.creatorHash }),
  })

  if (!res.ok) {
    let message = `Ticket claim failed: ${res.status}`
    try {
      const data = await res.json() as { error?: string }
      if (data?.error) message = data.error
    }
    catch {
      // ignore
    }
    throw new TicketClaimError(message, res.status)
  }

  return res.json() as Promise<ClaimTicketResponse>
}

export async function validateToken(
  cfg: BackendConfig,
  token: string,
): Promise<ValidateTokenResponse> {
  const url = `${cfg.apiBaseUrl}/api/sdk/validate`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ShowAd-API-Key': cfg.apiKey,
      'X-ShowAd-Creator-Hash': cfg.creatorHash,
    },
    body: JSON.stringify({ token, sdk_key: cfg.apiKey }),
  })

  if (!res.ok) {
    return { valid: false, message: `HTTP ${res.status}` }
  }

  try {
    return await res.json() as ValidateTokenResponse
  }
  catch {
    return { valid: false, message: 'Invalid response' }
  }
}
