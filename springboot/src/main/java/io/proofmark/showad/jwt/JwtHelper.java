package io.proofmark.showad.jwt;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * JWT decoder that mirrors the helpers exposed by the Laravel and Next.js
 * SDKs.
 *
 * <strong>Important:</strong> this helper does NOT verify the JWT signature.
 * Signature verification is the responsibility of the ProofMark backend.
 * Locally we only inspect claims to pre-filter expired or mismatched tokens
 * before paying for a network round-trip.
 *
 * <p>Defense-in-depth: rejects tokens whose header {@code alg} is {@code none}
 * or outside the HS256/HS384/HS512/RS256/RS384/RS512/ES256/ES384 whitelist.
 */
public class JwtHelper {

    public static final String EXPECTED_ISSUER = "showad-backend";

    public static final long DEFAULT_LEEWAY_SECONDS = 60L;

    public static final Set<String> ALLOWED_ALGORITHMS = Set.of(
        "HS256", "HS384", "HS512",
        "RS256", "RS384", "RS512",
        "ES256", "ES384"
    );

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
            byte[] headerBytes = Base64.getUrlDecoder().decode(padBase64(parts[0]));
            JsonNode header = objectMapper.readTree(new String(headerBytes, StandardCharsets.UTF_8));
            if (header == null || !header.isObject() || !header.hasNonNull("alg")) {
                return null;
            }
            String alg = header.get("alg").asText();
            if (!ALLOWED_ALGORITHMS.contains(alg)) {
                return null;
            }

            byte[] payload = Base64.getUrlDecoder().decode(padBase64(parts[1]));
            return objectMapper.readValue(new String(payload, StandardCharsets.UTF_8), TokenClaims.class);
        } catch (Exception ex) {
            return null;
        }
    }

    public boolean isExpired(String token) {
        return isExpired(token, DEFAULT_LEEWAY_SECONDS);
    }

    public boolean isExpired(String token, long leewaySeconds) {
        TokenClaims claims = decode(token);
        if (claims == null) {
            return true;
        }
        long now = clock.instant().getEpochSecond();
        if (claims.getExp() != null && (claims.getExp() + leewaySeconds) < now) {
            return true;
        }
        if (claims.getNbf() != null && (claims.getNbf() - leewaySeconds) > now) {
            return true;
        }
        if (claims.getIat() != null && (claims.getIat() - leewaySeconds) > now) {
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
        return validateClaims(token, expectedCreatorHash, expectedFingerprint, new ClaimValidationOptions());
    }

    public ValidationResult validateClaims(
        String token,
        String expectedCreatorHash,
        String expectedFingerprint,
        ClaimValidationOptions options
    ) {
        TokenClaims claims = decode(token);
        if (claims == null) {
            return ValidationResult.invalid("invalid_format");
        }
        if (isExpired(token, options.leewaySeconds)) {
            return ValidationResult.invalid("expired");
        }
        if (expectedCreatorHash == null
            || !fixedTimeEquals(expectedCreatorHash, claims.getCreatorHash())) {
            return ValidationResult.invalid("creator_mismatch");
        }
        if (expectedFingerprint != null
            && !fixedTimeEquals(expectedFingerprint, claims.getFingerprint())) {
            return ValidationResult.invalid("fingerprint_mismatch");
        }
        String iss = claims.getIss();
        if (options.requireIssuer) {
            if (!EXPECTED_ISSUER.equals(iss)) {
                return ValidationResult.invalid("invalid_issuer");
            }
        } else if (iss != null && !EXPECTED_ISSUER.equals(iss)) {
            return ValidationResult.invalid("invalid_issuer");
        }
        return ValidationResult.ok();
    }

    public static Instant nowFromClock(Clock clock) {
        return clock.instant();
    }

    private static boolean fixedTimeEquals(String expected, String actual) {
        if (expected == null || actual == null) {
            return false;
        }
        byte[] a = expected.getBytes(StandardCharsets.UTF_8);
        byte[] b = actual.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(a, b);
    }

    private static String padBase64(String value) {
        int rem = value.length() % 4;
        if (rem == 0) {
            return value;
        }
        return value + "====".substring(rem);
    }

    public static final class ClaimValidationOptions {
        public long leewaySeconds = DEFAULT_LEEWAY_SECONDS;
        public boolean requireIssuer = true;

        public ClaimValidationOptions() {}

        public ClaimValidationOptions(long leewaySeconds, boolean requireIssuer) {
            this.leewaySeconds = leewaySeconds;
            this.requireIssuer = requireIssuer;
        }
    }

    public record ValidationResult(boolean valid, String reason) {
        public static ValidationResult ok() { return new ValidationResult(true, null); }
        public static ValidationResult invalid(String reason) { return new ValidationResult(false, reason); }
    }
}
