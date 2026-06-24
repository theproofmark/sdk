export interface PmVerifyGlobal {
  render(container: string | HTMLElement, options: {
    sitekey: string;
    callback?: (token: string) => void;
    'expired-callback'?: () => void;
    'error-callback'?: (code: string) => void;
    theme?: 'light' | 'dark' | 'auto';
    action?: string;
    lang?: string;
  }): number;
  getResponse(id: number): string;
  reset(id: number): void;
  remove(id: number): void;
  execute(id: number): void;
}

declare global {
  interface Window { pmverify?: PmVerifyGlobal }
}

export interface ProofMarkVerifyHandle {
  reset(): void;
}

export interface ProofMarkVerifyProps {
  siteKey: string;
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: (code: string) => void;
  theme?: 'light' | 'dark' | 'auto';
  action?: string;
  lang?: string;
  /** Base URL the api.js script loads from. Default https://verify.proofmark.com */
  scriptBaseUrl?: string;
}
