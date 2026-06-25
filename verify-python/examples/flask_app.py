"""Flask application example for ProofMark Verify."""

import os
from flask import Flask, request, jsonify
from proofmark_verify import ProofMarkVerify, ProofMarkVerifyError

app = Flask(__name__)

# Initialize the client once at startup
pmv = ProofMarkVerify(secret=os.environ['PMV_SECRET_KEY'])


@app.route('/signup', methods=['POST'])
def signup():
    """Example Flask signup route with ProofMark Verify."""
    # Get token from form data
    token = request.form.get('pm-verify-response', '')

    # Get user's IP address
    remoteip = request.remote_addr

    try:
        # Verify the token
        result = pmv.verify(token, remoteip=remoteip)

        # Check if user is human (default threshold: 0.5)
        if not result.is_human():
            return jsonify({
                'error': 'Verification failed',
                'score': result.score,
                'flags': result.flags
            }), 400

        # Optional: Inspect risk flags
        if 'fast_completion' in result.flags:
            # Maybe require additional verification
            pass

        # Proceed with signup
        email = request.form.get('email')
        # ... create user account

        return jsonify({'message': 'Welcome!', 'score': result.score})

    except ProofMarkVerifyError as e:
        # Handle network/timeout errors
        # In production, you might want to fail-open or queue for retry
        app.logger.error(f'ProofMark Verify error: {e.code} - {e}')
        return jsonify({'error': 'Verification unavailable'}), 503


@app.route('/password-reset', methods=['POST'])
def password_reset():
    """Example of using a higher score threshold for sensitive operations."""
    token = request.form.get('pm-verify-response', '')

    try:
        result = pmv.verify(token, remoteip=request.remote_addr)

        # Use higher threshold for password reset (0.7 recommended)
        if not result.is_human(min_score=0.7):
            return jsonify({
                'error': 'Verification failed or score too low',
                'score': result.score
            }), 400

        # Proceed with password reset
        # ...

        return jsonify({'message': 'Password reset email sent'})

    except ProofMarkVerifyError as e:
        app.logger.error(f'ProofMark Verify error: {e.code} - {e}')
        return jsonify({'error': 'Verification unavailable'}), 503


if __name__ == '__main__':
    app.run(debug=True)
