/**
 * Fingerprint collection utility for ShowAd SDK
 * Uses FingerprintJS - MUST match the main frontend implementation exactly
 * 
 * The fingerprint (visitorId) generated here MUST be identical to what
 * the ShowAd video ad frontend generates, otherwise validation will fail.
 */

import type { FingerprintData } from '../types';

let fpPromise: Promise<any> | null = null;

/**
 * Initialize and get browser fingerprint
 * This is the EXACT same implementation as the ShowAd frontend
 */
export async function getFingerprint(): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Fingerprinting is only available in browser environment');
  }

  try {
    // Initialize FingerprintJS only once
    if (!fpPromise) {
      const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
      fpPromise = FingerprintJS.load();
    }

    const fp = await fpPromise;
    const result = await fp.get();

    return result.visitorId;
  } catch (error) {
    console.error('Failed to generate fingerprint:', error);
    // Fallback to a simple hash if fingerprinting fails
    // MUST match the fallback in ShowAd frontend exactly
    return generateFallbackFingerprint();
  }
}

/**
 * Get detailed FingerprintJS info: visitorId, confidence score, raw JSON
 * Matches ShowAd frontend implementation
 */
export async function getFingerprintDetails(): Promise<FingerprintData> {
  if (typeof window === 'undefined') {
    throw new Error('Fingerprinting is only available in browser environment');
  }

  try {
    if (!fpPromise) {
      const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
      fpPromise = FingerprintJS.load();
    }
    const fp = await fpPromise;
    const result = await fp.get();
    const confidenceScore = result?.confidence?.score;
    const rawJSON = JSON.stringify(result);
    return {
      visitorId: result.visitorId,
      confidenceScore,
      rawJSON,
    };
  } catch (error) {
    console.error('Failed to get fingerprint details:', error);
    return {
      visitorId: generateFallbackFingerprint(),
    };
  }
}

/**
 * Fallback fingerprint generation using basic browser info
 * CRITICAL: This MUST match the ShowAd frontend fallback exactly!
 */
function generateFallbackFingerprint(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const nav = navigator;
  const screen = window.screen;

  const components = [
    nav.userAgent,
    nav.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    !!window.sessionStorage,
    !!window.localStorage,
  ];

  const fingerprint = components.join('|');

  // Simple hash function - MUST match frontend exactly
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(36);
}

/**
 * Get device type
 */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') {
    return 'desktop';
  }

  const ua = navigator.userAgent;

  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

/**
 * Get browser name and version from the current user agent
 */
export function getBrowserInfo(): {
  name: 'Edge' | 'Opera' | 'Chrome' | 'Firefox' | 'Safari' | 'Unknown';
  version: string;
  userAgent: string;
} {
  if (typeof window === 'undefined') {
    return {
      name: 'Unknown',
      version: '',
      userAgent: '',
    };
  }

  const userAgent = navigator.userAgent;
  const matchers: Array<{
    pattern: RegExp;
    name: 'Edge' | 'Opera' | 'Chrome' | 'Firefox' | 'Safari';
  }> = [
    { pattern: /Edg\/([\d.]+)/, name: 'Edge' },
    { pattern: /OPR\/([\d.]+)/, name: 'Opera' },
    { pattern: /Chrome\/([\d.]+)/, name: 'Chrome' },
    { pattern: /Firefox\/([\d.]+)/, name: 'Firefox' },
    { pattern: /Version\/([\d.]+).*Safari/, name: 'Safari' },
  ];

  for (const matcher of matchers) {
    const match = userAgent.match(matcher.pattern);
    if (match) {
      return {
        name: matcher.name,
        version: match[1],
        userAgent,
      };
    }
  }

  return {
    name: 'Unknown',
    version: '',
    userAgent,
  };
}

/**
 * Check if fingerprinting is available (browser environment)
 */
export function isFingerprintAvailable(): boolean {
  return typeof window !== 'undefined';
}
