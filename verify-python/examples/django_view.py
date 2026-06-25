"""
Django view example for ProofMark Verify.

Framework-free snippet:
    from proofmark_verify import ProofMarkVerify
    import os

    pmv = ProofMarkVerify(secret=os.environ['PMV_SECRET_KEY'])
    token = form_data.get('pm-verify-response')
    result = pmv.verify(token, remoteip=user_ip)

    if result.is_human():
        # Proceed with action
        pass
    else:
        # Reject as bot
        pass
"""

import os
from django.http import HttpResponse, HttpResponseBadRequest
from django.views.decorators.http import require_POST
from proofmark_verify import ProofMarkVerify


@require_POST
def signup_view(request):
    """Example Django signup view with ProofMark Verify."""
    # Initialize client with secret key from environment
    pmv = ProofMarkVerify(secret=os.environ['PMV_SECRET_KEY'])

    # Get token from POST data
    token = request.POST.get('pm-verify-response', '')

    # Get user's IP address
    remoteip = request.META.get('REMOTE_ADDR')

    # Verify the token
    result = pmv.verify(token, remoteip=remoteip)

    # Check if user is human (default threshold: 0.5)
    if not result.is_human():
        return HttpResponseBadRequest('Verification failed')

    # Optional: Check specific flags for finer-grained decisions
    if 'datacenter_ip' in result.flags:
        # Log suspicious activity but maybe allow anyway
        pass

    # Optional: Use custom threshold for sensitive operations
    if not result.is_human(min_score=0.7):
        return HttpResponseBadRequest('Score too low for this action')

    # Proceed with signup
    email = request.POST.get('email')
    # ... create user account

    return HttpResponse('Welcome!')
