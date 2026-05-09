/**
 * API client for ShowAd backend communication
 */

import type {
  ShowAdConfig,
  ShowAdClientConfig,
  ClaimTicketRequest,
  ClaimTicketResponse,
  ValidateTokenResponse,
  ShowAdError,
  ShowAdErrorCode,
} from '../types';
import { ShowAdError as ShowAdErrorClass, ShowAdErrorCode as ErrorCode } from '../types';

const DEFAULT_API_BASE_URL = 'https://ad.proofmark.io';

/**
 * Get the API base URL from config
 */
function getApiBaseUrl(config: ShowAdConfig): string {
  return config.apiBaseUrl || 
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SHOWAD_API_URL) || 
    DEFAULT_API_BASE_URL;
}

function getClientApiBaseUrl(config: ShowAdClientConfig): string {
  return config.apiBaseUrl || 
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SHOWAD_API_URL) || 
    DEFAULT_API_BASE_URL;
}

/**
 * Create headers for API requests
 */
function createHeaders(config: ShowAdConfig, additionalHeaders?: Record<string, string>): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-ShowAd-API-Key': config.apiKey,
    'X-ShowAd-Creator-Hash': config.creatorHash,
    ...additionalHeaders,
  });
  return headers;
}

/**
 * Log debug message if debug mode is enabled
 */
function debugLog(config: ShowAdConfig, ...args: unknown[]): void {
  if (config.debug) {
    console.log('[ShowAd SDK]', ...args);
  }
}

/**
 * Claim a redirect ticket and get the JWT token
 * This is called after the user is redirected back from the video ad
 */
export async function claimRedirectTicket(
  config: ShowAdConfig,
  ticketId: string,
  redirectSecret: string
): Promise<ClaimTicketResponse> {
  const baseUrl = getApiBaseUrl(config);
  const url = `${baseUrl}/api/redirect-ticket/${ticketId}/claim`;

  debugLog(config, 'Claiming redirect ticket:', ticketId);

  const body: ClaimTicketRequest = {
    creator_hash: config.creatorHash,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: createHeaders(config, {
        'X-Redirect-Ticket-Secret': redirectSecret,
      }),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || `HTTP ${response.status}`;

      if (response.status === 410) {
        throw new ShowAdErrorClass(
          ErrorCode.TICKET_NOT_FOUND,
          'Redirect ticket not found or already consumed',
          { ticketId }
        );
      }

      if (response.status === 401) {
        throw new ShowAdErrorClass(
          ErrorCode.TICKET_CLAIM_FAILED,
          'Invalid redirect ticket secret',
          { ticketId }
        );
      }

      if (response.status === 403) {
        throw new ShowAdErrorClass(
          ErrorCode.CREATOR_MISMATCH,
          'Creator hash does not match ticket',
          { ticketId }
        );
      }

      throw new ShowAdErrorClass(
        ErrorCode.TICKET_CLAIM_FAILED,
        errorMessage,
        { ticketId, status: response.status }
      );
    }

    const data: ClaimTicketResponse = await response.json();
    debugLog(config, 'Ticket claimed successfully:', data.ticket_id);

    return data;
  } catch (error) {
    if (error instanceof ShowAdErrorClass) {
      throw error;
    }

    throw new ShowAdErrorClass(
      ErrorCode.NETWORK_ERROR,
      `Failed to claim redirect ticket: ${(error as Error).message}`,
      { ticketId }
    );
  }
}

/**
 * Validate a JWT token with the backend
 */
export async function validateToken(
  config: ShowAdConfig,
  token: string
): Promise<ValidateTokenResponse> {
  const baseUrl = getApiBaseUrl(config);
  const url = `${baseUrl}/api/sdk/validate`;

  debugLog(config, 'Validating token');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: createHeaders(config),
      body: JSON.stringify({
        token,
        sdk_key: config.apiKey,
      }),
    });

    if (!response.ok) {
      throw new ShowAdErrorClass(
        ErrorCode.TOKEN_INVALID,
        `Token validation failed: HTTP ${response.status}`,
        { status: response.status }
      );
    }

    const data: ValidateTokenResponse = await response.json();
    debugLog(config, 'Token validation result:', data.valid);

    if (!data.valid) {
      throw new ShowAdErrorClass(
        ErrorCode.TOKEN_INVALID,
        data.message || 'Token is invalid',
        { message: data.message }
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ShowAdErrorClass) {
      throw error;
    }

    throw new ShowAdErrorClass(
      ErrorCode.NETWORK_ERROR,
      `Failed to validate token: ${(error as Error).message}`
    );
  }
}

/**
 * Validate token using Authorization header (for SSR)
 */
export async function validateTokenWithHeader(
  config: ShowAdConfig,
  token: string
): Promise<ValidateTokenResponse> {
  const baseUrl = getApiBaseUrl(config);
  const url = `${baseUrl}/api/sdk/validate`;

  debugLog(config, 'Validating token with header');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: createHeaders(config, {
        'Authorization': `Bearer ${token}`,
      }),
    });

    const data: ValidateTokenResponse = await response.json();

    if (!data.valid) {
      throw new ShowAdErrorClass(
        ErrorCode.TOKEN_INVALID,
        data.message || 'Token is invalid',
        { message: data.message }
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ShowAdErrorClass) {
      throw error;
    }

    throw new ShowAdErrorClass(
      ErrorCode.NETWORK_ERROR,
      `Failed to validate token: ${(error as Error).message}`
    );
  }
}

/**
 * Build the video ad redirect URL
 * This is where users are sent when they need to watch an ad
 */
export function buildVideoAdRedirectUrl(config: ShowAdClientConfig, returnUrl: string): string {
  const videoAdUrl = config.videoAdUrl || 
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SHOWAD_VIDEO_URL) || 
    'https://showad.proofmark.io';

  const url = new URL(videoAdUrl);
  url.pathname = `/c/${config.creatorHash}`;
  url.searchParams.set('return_url', returnUrl);
  url.searchParams.set('sdk', '1');

  return url.toString();
}

/**
 * Build the video ad redirect URL for a specific resource
 */
export function buildResourceRedirectUrl(
  config: ShowAdClientConfig,
  projectHash: string,
  resourceHash: string,
  returnUrl: string
): string {
  const videoAdUrl = config.videoAdUrl || 
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SHOWAD_VIDEO_URL) || 
    'https://showad.proofmark.io';

  const url = new URL(videoAdUrl);
  url.pathname = `/c/${config.creatorHash}/${projectHash}/${resourceHash}`;
  url.searchParams.set('return_url', returnUrl);
  url.searchParams.set('sdk', '1');

  return url.toString();
}

/**
 * Check backend health
 */
export async function checkHealth(config: ShowAdClientConfig): Promise<boolean> {
  const baseUrl = getClientApiBaseUrl(config);
  const url = `${baseUrl}/health`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.status === 'ok' || data.status === 'degraded';
  } catch {
    return false;
  }
}

