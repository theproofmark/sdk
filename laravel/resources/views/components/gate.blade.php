{{-- ShowAd Gate Component --}}
{{-- Shows protected content if verified, fallback otherwise --}}
@if(app(\ProofMark\ShowAd\ShowAdManager::class)->isVerified(request()))
    {{ $slot }}
@else
    @if(isset($unverified))
        {{ $unverified }}
    @else
        <div style="text-align: center; padding: 2rem;">
            <p style="margin-bottom: 1rem; color: #666;">This content requires verification.</p>
            <a href="{{ app(\ProofMark\ShowAd\ShowAdManager::class)->buildVideoAdRedirectUrl(request()->fullUrl()) }}"
               style="display: inline-block; padding: 0.75rem 1.5rem; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 0.375rem; font-weight: 600;">
                Watch Ad to Unlock
            </a>
        </div>
    @endif
@endif
