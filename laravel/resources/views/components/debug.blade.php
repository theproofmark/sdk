{{-- ShowAd Debug Panel --}}
{{-- Only renders when APP_DEBUG is true --}}
@if(config('app.debug'))
@php
    $showadManager = app(\ProofMark\ShowAd\ShowAdManager::class);
    $state = $showadManager->getVerificationState(request());
@endphp
<div id="showad-debug-panel" style="position: fixed; bottom: 1rem; right: 1rem; z-index: 9999; background: #1a1a2e; color: #e0e0e0; padding: 1rem; border-radius: 0.5rem; font-family: monospace; font-size: 0.75rem; max-width: 320px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <strong style="color: #4ecdc4;">ShowAd Debug</strong>
        <button onclick="this.parentElement.parentElement.style.display='none'" style="background: none; border: none; color: #888; cursor: pointer; font-size: 1rem;">&times;</button>
    </div>
    <div style="border-top: 1px solid #333; padding-top: 0.5rem;">
        <div style="margin-bottom: 0.25rem;">
            <span style="color: #888;">Verified:</span>
            <span style="color: {{ $state['is_verified'] ? '#4ecdc4' : '#ff6b6b' }};">
                {{ $state['is_verified'] ? 'Yes' : 'No' }}
            </span>
        </div>
        <div style="margin-bottom: 0.25rem;">
            <span style="color: #888;">Creator:</span>
            <span>{{ $state['creator_hash'] ?? 'N/A' }}</span>
        </div>
        @if($state['expires_at'])
        <div style="margin-bottom: 0.25rem;">
            <span style="color: #888;">Expires:</span>
            <span id="showad-debug-expiry">{{ date('H:i:s', $state['expires_at'] / 1000) }}</span>
        </div>
        @endif
        @if(!$state['is_verified'] && $state['redirect_url'])
        <div style="margin-top: 0.5rem;">
            <a href="{{ $state['redirect_url'] }}" style="color: #4ecdc4; text-decoration: underline; font-size: 0.7rem;">
                → Verify Now
            </a>
        </div>
        @endif
    </div>
</div>
@endif
