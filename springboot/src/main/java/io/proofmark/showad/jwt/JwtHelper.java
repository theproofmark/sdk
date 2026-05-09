package io.proofmark.showad.jwt;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * JWT decoder that mirrors the helpers exposed by the Laravel and Next.js
 * SDKs.
 *
 * <strong>Important:</strong> this helper does NOT verify the JWT signature.
 * Signature verification is the responsibility of the ProofMark backend.
 * Locally we only inspect claims to pre-filter expired or mismatched tokens
 * before paying for a network round-trip.
 */
public class JwtHelper {

    private final ObjectMapper objectMapper;
    private final Clock clock;

    public JwtHelper() {
        this(new ObjectMapper(), Clock.systemUTC());
    }

    public JwtHelper(ObjectMapper objectMapper, Clock clock) {
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public TokenClaims decode(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return null;
        }
        try {
            byte[] payload = Base64.getUrlDecoder().decode(padBase64(parts[1]));
            return objectMapper.readValue(new String(payload, StandardCharsets.UTF_8), TokenClaims.class);
        } catch (Exception ex) {
            return null;
        }
    }

    public boolean isExpired(String token) {
        TokenClaims claims = decode(token);
        if (claims == null) {
            return true;
        }
        long now = clock.instant().getEpochSecond();
        if (claims.getExp() != null && claims.getExp() < now) {
            return true;
        }
        if (claims.getNbf() != null && claims.getNbf() > now) {
            return true;
        }
        return false;
    }

    /**
     * Returns the token expiry as unix seconds, matching the JWT {@code exp}
     * claim and the {@code showad_expires} cookie payload used by the SDKs.
     */
    public Long getExpirySeconds(String token) {
        TokenClaims claims = decode(token);
        if (claims == null || claims.getExp() == null) {
            return null;
        }
        return claims.getExp();
    }

    /**
     * @deprecated Use {@link #getExpirySeconds(String)}. Kept only to avoid
     *             source breaks for early adopters of the draft SDK.
     */
    @Deprecated
    public Long getExpiryMillis(String token) {
        return getExpirySeconds(token);
    }

    public ValidationResult validateClaims(String token, String expectedCreatorHash, String expectedFingerprint) {
        TokenClaims claims = decode(token);
        if (claims == null) {
            return ValidationResult.invalid("invalid_format");
        }
        if (isExpired(token)) {
            return ValidationResult.invalid("expired");
        }
        if (expectedCreatorHash == null || !expectedCreatorHash.equals(claims.getCreatorHash())) {
            return ValidationResult.invalid("creator_mismatch");
        }
        if (expectedFingerprint != null
            && !expectedFingerprint.equals(claims.getFingerprint())) {
            return ValidationResult.invalid("fingerprint_mismatch");
        }
        if (claims.getIss() != null && !"showad-backend".equals(claims.getIss())) {
            return ValidationResult.invalid("invalid_issuer");
        }
        return ValidationResult.ok();
    }

    public static Instant nowFromClock(Clock clock) {
        return clock.instant();
    }

    private static String padBase64(String value) {
        int rem = value.length() % 4;
        if (rem == 0) {
            return value;
        }
        return value + "====".substring(rem);
    }

    public record ValidationResult(boolean valid, String reason) {
        public static ValidationResult ok() { return new ValidationResult(true, null); }
        public static ValidationResult invalid(String reason) { return new ValidationResult(false, reason); }
    }
}
