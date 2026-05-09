/**
 * ProofMark backend API client. Mirrors @showad/nextjs-sdk wire calls:
 *   POST /api/redirect-ticket/:id/claim
 *   POST /api/sdk/validate
 */

const DEFAULT_API_BASE_URL = 'https://ad.proofmark.io';

export interface ProofMarkApiConfig {
  apiBaseUrl?: string;
  apiKey: string;
  creatorHash: string;
  redirectSecret?: string;
  debug?: boolean;
}

export interface ClaimTicketResponse {
  ticket_id: string;
  token: string;
  creator_hash: string;
  expires_at?: number;
}

export interface ValidateTokenResponse {
  valid: boolean;
  message?: string;
  claims?: Record<string, unknown> | null;
}

export class ProofMarkApiError extends Error {
  code: string;
  status?: number;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, opts: { status?: number; details?: Record<string, unknown> } = {}) {
    super(message);
    this.code = code;
    this.status = opts.status;
    this.details = opts.details;
  }
}

function baseUrl(config: ProofMarkApiConfig): string {
  return config.apiBaseUrl || process.env.SHOWAD_API_URL || DEFAULT_API_BASE_URL;
}

function headers(config: ProofMarkApiConfig, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-ShowAd-API-Key': config.apiKey,
    'X-ShowAd-Creator-Hash': config.creatorHash,
    ...extra,
  };
}

export async function claimRedirectTicket(
  config: ProofMarkApiConfig,
  ticketId: string,
  redirectSecret?: string
): Promise<ClaimTicketResponse> {
  if (!ticketId || !/^[A-Za-z0-9_-]+$/.test(ticketId)) {
    throw new ProofMarkApiError('TICKET_ID_INVALID', 'Invalid ticket id');
  }

  const secret = redirectSecret || config.redirectSecret;
  if (!secret) {
    throw new ProofMarkApiError('CONFIG_MISSING', 'Redirect secret is required');
  }

  const url = `${baseUrl(config)}/api/redirect-ticket/${encodeURIComponent(ticketId)}/claim`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(config, { 'X-Redirect-Ticket-Secret': secret }),
    body: JSON.stringify({ creator_hash: config.creatorHash }),
  });

  if (!res.ok) {
    const data = await safeJson(res);
    let message = `HTTP ${res.status}`;
    if (typeof data === 'object' && data !== null) {
      const e = (data as Record<string, unknown>).error;
      if (typeof e === 'string') message = e;
    }
    if (res.status === 410) throw new ProofMarkApiError('TICKET_NOT_FOUND', 'Ticket not found or already consumed', { status: res.status });
    if (res.status === 401) throw new ProofMarkApiError('TICKET_CLAIM_FAILED', 'Invalid redirect ticket secret', { status: res.status });
    if (res.status === 403) throw new ProofMarkApiError('CREATOR_MISMATCH', 'Creator hash does not match ticket', { status: res.status });
    throw new ProofMarkApiError('TICKET_CLAIM_FAILED', message, { status: res.status });
  }

  const data = (await res.json()) as ClaimTicketResponse;
  if (!data.token || !data.creator_hash) {
    throw new ProofMarkApiError('TICKET_CLAIM_FAILED', 'Malformed claim response');
  }
  return data;
}

export async function validateToken(
  config: ProofMarkApiConfig,
  token: string
): Promise<ValidateTokenResponse> {
  const url = `${baseUrl(config)}/api/sdk/validate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({ token, sdk_key: config.apiKey }),
  });

  if (!res.ok) {
    throw new ProofMarkApiError('TOKEN_INVALID', `Token validation failed: HTTP ${res.status}`, { status: res.status });
  }
  return (await res.json()) as ValidateTokenResponse;
}

export async function checkHealth(config: ProofMarkApiConfig): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl(config)}/health`);
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === 'ok' || data.status === 'degraded';
  } catch {
    return false;
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
