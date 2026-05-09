/**
 * Backend HTTP client (uses global fetch from Node 18+ / Remix runtime).
 */

import type {
  ShowAdConfig,
  ClaimTicketRequest,
  ClaimTicketResponse,
  ValidateTokenResponse,
} from '../types';
import { ShowAdError, ShowAdErrorCode } from '../types';

const DEFAULT_API_BASE_URL = 'https://ad.proofmark.io';

export function resolveApiBaseUrl(config: Pick<ShowAdConfig, 'apiBaseUrl'>): string {
  return (
    config.apiBaseUrl ||
    (typeof process !== 'undefined' && process.env?.SHOWAD_API_URL) ||
    DEFAULT_API_BASE_URL
  );
}

function debugLog(config: Pick<ShowAdConfig, 'debug'>, ...args: unknown[]): void {
  if (config.debug) {
    // eslint-disable-next-line no-console
    console.log('[ShowAd Remix SDK]', ...args);
  }
}

function authHeaders(
  config: Pick<ShowAdConfig, 'apiKey' | 'creatorHash'>,
  extra?: Record<string, string>
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-ShowAd-API-Key': config.apiKey,
    'X-ShowAd-Creator-Hash': config.creatorHash,
    ...extra,
  };
}

/**
 * Claim a redirect ticket and exchange it for a JWT.
 * Called when the visitor is redirected back from the video ad with `?redirect_ticket=`.
 */
export async function claimRedirectTicket(
  config: ShowAdConfig,
  ticketId: string
): Promise<ClaimTicketResponse> {
  const url = `${resolveApiBaseUrl(config)}/api/redirect-ticket/${encodeURIComponent(ticketId)}/claim`;
  debugLog(config, 'Claiming ticket:', ticketId);

  const body: ClaimTicketRequest = { creator_hash: config.creatorHash };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(config, {
        'X-Redirect-Ticket-Secret': config.redirectSecret,
      }),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ShowAdError(
      ShowAdErrorCode.NETWORK_ERROR,
      `Failed to reach ShowAd backend: ${(err as Error).message}`,
      { ticketId }
    );
  }

  if (!response.ok) {
    const errorData = await safeJson(response);
    if (response.status === 410) {
      throw new ShowAdError(
        ShowAdErrorCode.TICKET_NOT_FOUND,
        'Redirect ticket not found or already consumed',
        { ticketId, status: response.status }
      );
    }
    if (response.status === 401) {
      throw new ShowAdError(
        ShowAdErrorCode.TICKET_CLAIM_FAILED,
        'Invalid redirect ticket secret',
        { ticketId, status: response.status }
      );
    }
    if (response.status === 403) {
      throw new ShowAdError(
        ShowAdErrorCode.CREATOR_MISMATCH,
        'Creator hash does not match the ticket',
        { ticketId, status: response.status }
      );
    }
    throw new ShowAdError(
      ShowAdErrorCode.TICKET_CLAIM_FAILED,
      errorData?.error || `Ticket claim failed: HTTP ${response.status}`,
      { ticketId, status: response.status }
    );
  }

  const data = (await response.json()) as ClaimTicketResponse;
  debugLog(config, 'Ticket claimed:', data.ticket_id);
  return data;
}

/** Validate a JWT against the backend (POST /api/sdk/validate). */
export async function validateToken(
  config: ShowAdConfig,
  token: string
): Promise<ValidateTokenResponse> {
  const url = `${resolveApiBaseUrl(config)}/api/sdk/validate`;
  debugLog(config, 'Validating token');

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify({ token, sdk_key: config.apiKey }),
    });
  } catch (err) {
    throw new ShowAdError(
      ShowAdErrorCode.NETWORK_ERROR,
      `Failed to reach ShowAd backend: ${(err as Error).message}`
    );
  }

  if (!response.ok) {
    throw new ShowAdError(
      ShowAdErrorCode.TOKEN_INVALID,
      `Token validation failed: HTTP ${response.status}`,
      { status: response.status }
    );
  }

  const data = (await response.json()) as ValidateTokenResponse;
  if (!data.valid) {
    throw new ShowAdError(
      ShowAdErrorCode.TOKEN_INVALID,
      data.message || 'Token is invalid',
      { message: data.message }
    );
  }
  return data;
}

/** GET /health -> boolean. Never throws. */
export async function checkHealth(
  config: Pick<ShowAdConfig, 'apiBaseUrl'>
): Promise<boolean> {
  try {
    const response = await fetch(`${resolveApiBaseUrl(config)}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { status?: string };
    return data?.status === 'ok' || data?.status === 'degraded';
  } catch {
    return false;
  }
}

async function safeJson(response: Response): Promise<Record<string, string> | null> {
  try {
    return (await response.json()) as Record<string, string>;
  } catch {
    return null;
  }
}
