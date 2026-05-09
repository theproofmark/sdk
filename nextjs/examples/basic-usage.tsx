/**
 * ShowAd Next.js SDK - Basic Usage Example
 * 
 * This file demonstrates how to integrate ShowAd into a Next.js application.
 */

// ============================================================
// STEP 1: Create configuration file (lib/showad.ts)
// ============================================================

import { createShowAdConfig } from '@showad/nextjs-sdk';

export const showAdConfig = createShowAdConfig({
  creatorHash: process.env.NEXT_PUBLIC_SHOWAD_CREATOR_HASH!,
  apiKey: process.env.SHOWAD_API_KEY!,
  // Optional: Enable debug mode in development
  debug: process.env.NODE_ENV === 'development',
});

// ============================================================
// STEP 2: Add Provider to your layout (app/layout.tsx)
// ============================================================

/*
'use client';

import { ShowAdProvider } from '@showad/nextjs-sdk/client';
import { showAdConfig } from '@/lib/showad';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ShowAdProvider 
          config={showAdConfig}
          autoRedirect={true}  // Auto-redirect to video ad if not verified
        >
          {children}
        </ShowAdProvider>
      </body>
    </html>
  );
}
*/

// ============================================================
// STEP 3A: Use ShowAdGate component for simple protection
// ============================================================

/*
'use client';

import { ShowAdGate, ShowAdDebug } from '@showad/nextjs-sdk/client';

export default function ProtectedPage() {
  return (
    <>
      <ShowAdGate
        loadingContent={
          <div className="flex items-center justify-center h-screen">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
          </div>
        }
        unverifiedContent={
          <div className="flex flex-col items-center justify-center h-screen gap-4">
            <h1 className="text-2xl font-bold">Content Locked</h1>
            <p>Watch a short video ad to unlock this content.</p>
          </div>
        }
      >
        <main className="container mx-auto p-8">
          <h1 className="text-3xl font-bold mb-4">Premium Content</h1>
          <p>This content is only visible after watching the video ad.</p>
          <div className="mt-8 p-4 bg-gray-100 rounded">
            <h2 className="text-xl font-semibold">Exclusive Features</h2>
            <ul className="list-disc list-inside mt-2">
              <li>Feature 1</li>
              <li>Feature 2</li>
              <li>Feature 3</li>
            </ul>
          </div>
        </main>
      </ShowAdGate>
      
      {/* Debug component - only shows in development */}
      <ShowAdDebug />
    </>
  );
}
*/

// ============================================================
// STEP 3B: Use hooks for more control
// ============================================================

/*
'use client';

import { 
  useShowAd, 
  useRequireVerification,
  useVerificationExpiry 
} from '@showad/nextjs-sdk/client';

export default function ProtectedPage() {
  const { 
    isVerified, 
    isLoading, 
    error, 
    redirectToVideoAd 
  } = useShowAd();
  
  const { expiresIn } = useVerificationExpiry();

  // Option: Auto-redirect if not verified
  useRequireVerification({
    redirectOnFailure: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Verifying access...</p>
      </div>
    );
  }

  if (!isVerified) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <h1 className="text-2xl font-bold">Access Required</h1>
        {error && <p className="text-red-500">{error}</p>}
        <button
          onClick={() => redirectToVideoAd()}
          className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Watch Video Ad
        </button>
      </div>
    );
  }

  return (
    <main className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Protected Content</h1>
        {expiresIn !== null && (
          <span className="text-sm text-gray-500">
            Access expires in: {Math.floor(expiresIn / 60)}:{(expiresIn % 60).toString().padStart(2, '0')}
          </span>
        )}
      </div>
      <p>Welcome! You now have access to the protected content.</p>
    </main>
  );
}
*/

// ============================================================
// STEP 4: Server-side protection with middleware (middleware.ts)
// ============================================================

/*
import { NextRequest, NextResponse } from 'next/server';
import { createShowAdMiddleware } from '@showad/nextjs-sdk/middleware';

const showAdConfig = {
  creatorHash: process.env.NEXT_PUBLIC_SHOWAD_CREATOR_HASH!,
  apiKey: process.env.SHOWAD_API_KEY!,
};

const showAdMiddleware = createShowAdMiddleware(showAdConfig, {
  // Paths that require verification
  protectedPaths: [
    '/protected/*',
    '/premium/*',
    '/members/*',
  ],
  // Paths to exclude from protection
  excludePaths: [
    '/api/*',
    '/public/*',
    '/_next/*',
    '/favicon.ico',
  ],
  onVerificationFailed: (reason) => {
    console.log('Verification failed:', reason);
  },
});

export async function middleware(request: NextRequest) {
  return showAdMiddleware(request);
}

export const config = {
  matcher: [
    '/protected/:path*',
    '/premium/:path*',
    '/members/:path*',
  ],
};
*/

// ============================================================
// STEP 5: Server Component verification
// ============================================================

/*
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getVerificationFromCookies } from '@showad/nextjs-sdk/middleware';
import { buildVideoAdRedirectUrl } from '@showad/nextjs-sdk';

const showAdConfig = {
  creatorHash: process.env.NEXT_PUBLIC_SHOWAD_CREATOR_HASH!,
  apiKey: process.env.SHOWAD_API_KEY!,
};

export default async function ProtectedServerPage() {
  const cookieStore = cookies();
  const allCookies: Record<string, string> = {};
  
  cookieStore.getAll().forEach((cookie) => {
    allCookies[cookie.name] = cookie.value;
  });

  const verification = getVerificationFromCookies(allCookies, showAdConfig);

  if (!verification.isVerified) {
    const currentUrl = 'https://yoursite.com/protected'; // Get from headers in real app
    const redirectUrl = buildVideoAdRedirectUrl(showAdConfig, currentUrl);
    redirect(redirectUrl);
  }

  return (
    <main>
      <h1>Server-Protected Content</h1>
      <p>This page is protected at the server level.</p>
      <p>Your fingerprint: {verification.fingerprint}</p>
    </main>
  );
}
*/

// ============================================================
// Environment Variables (.env.local)
// ============================================================

/*
# Required
NEXT_PUBLIC_SHOWAD_CREATOR_HASH=your-creator-hash-here
SHOWAD_API_KEY=sk-your-api-key-here

# Optional (defaults provided by SDK)
NEXT_PUBLIC_SHOWAD_API_URL=https://ad.proofmark.io
NEXT_PUBLIC_SHOWAD_VIDEO_URL=https://showad.proofmark.io
SHOWAD_REDIRECT_SECRET=your-redirect-secret-here
*/

// Export to make this a module
export {};

