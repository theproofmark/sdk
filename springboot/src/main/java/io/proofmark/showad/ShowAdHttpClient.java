package io.proofmark.showad;

import io.proofmark.showad.api.ClaimTicketResponse;
import io.proofmark.showad.api.ValidateTokenResponse;

/**
 * Strategy interface for talking to the ProofMark ShowAd backend.
 *
 * Defined as an interface so applications and tests can swap in a mock or
 * record/replay client without bringing up a real {@code RestClient}.
 */
public interface ShowAdHttpClient {

    /**
     * Claim a redirect ticket. The backend responds with a JWT and the creator
     * hash; the SDK turns that into the verification cookies.
     *
     * @throws io.proofmark.showad.error.ShowAdException with a meaningful
     *         {@code errorCode} for 410 / 401 / 403 / network failures.
     */
    ClaimTicketResponse claimRedirectTicket(String ticketId);

    /**
     * Validate an existing token against the backend.
     */
    ValidateTokenResponse validateToken(String token);
}
