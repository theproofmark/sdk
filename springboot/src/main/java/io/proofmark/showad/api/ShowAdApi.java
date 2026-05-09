package io.proofmark.showad.api;

import io.proofmark.showad.ShowAdHttpClient;
import io.proofmark.showad.ShowAdProperties;
import io.proofmark.showad.jwt.JwtHelper;

/**
 * High-level facade exposed as a Spring bean for application code.
 *
 * Most consumers will rely on the {@link io.proofmark.showad.ShowAdFilter}
 * to gate requests, but this service is handy for ad-hoc verification (e.g.
 * inside a controller method or scheduled job).
 */
public class ShowAdApi {

    private final ShowAdProperties properties;
    private final ShowAdHttpClient httpClient;
    private final JwtHelper jwtHelper;

    public ShowAdApi(ShowAdProperties properties, ShowAdHttpClient httpClient, JwtHelper jwtHelper) {
        this.properties = properties;
        this.httpClient = httpClient;
        this.jwtHelper = jwtHelper;
    }

    public ClaimTicketResponse claimRedirectTicket(String ticketId) {
        return httpClient.claimRedirectTicket(ticketId);
    }

    public ValidateTokenResponse validateToken(String token) {
        return httpClient.validateToken(token);
    }

    public boolean isLocallyValid(String token, String fingerprint) {
        if (token == null || token.isBlank()) {
            return false;
        }
        JwtHelper.ValidationResult result = jwtHelper.validateClaims(token, properties.getCreatorHash(), fingerprint);
        return result.valid();
    }

    public ShowAdProperties getProperties() {
        return properties;
    }

    public JwtHelper getJwtHelper() {
        return jwtHelper;
    }
}
