/**
 * Widget-side traffic-integrity signals — a pruned mirror of
 * frontend/lib/traffic-integrity.ts's signal set (timezone, screen,
 * languages, WebGL vendor/renderer). Sent alongside the fingerprint on
 * /v1/verify/challenge so the fraud gate's WebGL-automation-signature
 * check (backend/services/verify_fraud_gate.go) has something to look at
 * from the very first request, not just at submit time.
 */
export interface TrafficIntegritySignals {
  timezone?: string;
  language?: string;
  languages?: string[];
  screen_width?: number;
  screen_height?: number;
  color_depth?: number;
  device_pixel_ratio?: number;
  hardware_concurrency?: number;
  webgl_vendor?: string;
  webgl_renderer?: string;
}

export function collectTrafficIntegritySignals(): TrafficIntegritySignals {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {};
  }

  const scr = window.screen;
  const signals: TrafficIntegritySignals = {
    timezone: safeTimezone(),
    language: navigator.language,
    languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 8) : undefined,
    screen_width: scr ? scr.width : undefined,
    screen_height: scr ? scr.height : undefined,
    color_depth: scr ? scr.colorDepth : undefined,
    device_pixel_ratio: window.devicePixelRatio,
    hardware_concurrency: navigator.hardwareConcurrency,
  };

  const webgl = getWebGLSummary();
  if (webgl) {
    signals.webgl_vendor = webgl.vendor;
    signals.webgl_renderer = webgl.renderer;
  }

  return pruneSignals(signals);
}

function pruneSignals<T extends Record<string, unknown>>(signals: T): T {
  const out = {} as T;
  (Object.keys(signals) as Array<keyof T>).forEach((key) => {
    const value = signals[key];
    if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
  });
  return out;
}

function safeTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function getWebGLSummary(): { vendor?: string; renderer?: string } | null {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl || typeof gl.getExtension !== 'function') return null;

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return null;

    return {
      vendor: String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)),
      renderer: String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)),
    };
  } catch {
    return null;
  }
}
