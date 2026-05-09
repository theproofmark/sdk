package io.proofmark.showad;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.proofmark.showad.jwt.JwtHelper;
import io.proofmark.showad.jwt.TokenClaims;

class JwtHelperTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private final Clock fixed = Clock.fixed(Instant.ofEpochSecond(1_700_000_000L), ZoneOffset.UTC);
    private final JwtHelper helper = new JwtHelper(mapper, fixed);

    @Test
    void decodesValidToken() {
        String token = buildToken(Map.of(
            "creator_hash", "abc123",
            "fingerprint", "fp",
            "iss", "showad-backend",
            "exp", 1_800_000_000L
        ));

        TokenClaims claims = helper.decode(token);
        assertThat(claims).isNotNull();
        assertThat(claims.getCreatorHash()).isEqualTo("abc123");
        assertThat(claims.getFingerprint()).isEqualTo("fp");
        assertThat(claims.getExp()).isEqualTo(1_800_000_000L);
    }

    @Test
    void invalidTokenReturnsNull() {
        assertThat(helper.decode(null)).isNull();
        assertThat(helper.decode("")).isNull();
        assertThat(helper.decode("not.a.jwt.atall")).isNull();
        assertThat(helper.decode("only.two")).isNull();
    }

    @Test
    void detectsExpiredTokens() {
        String expired = buildToken(Map.of(
            "creator_hash", "abc",
            "exp", 1_600_000_000L
        ));
        assertThat(helper.isExpired(expired)).isTrue();

        String live = buildToken(Map.of(
            "creator_hash", "abc",
            "exp", 1_800_000_000L
        ));
        assertThat(helper.isExpired(live)).isFalse();
    }

    @Test
    void respectsNotBeforeClaim() {
        String future = buildToken(Map.of(
            "creator_hash", "abc",
            "exp", 1_800_000_000L,
            "nbf", 1_750_000_000L
        ));
        assertThat(helper.isExpired(future)).isTrue();
    }

    @Test
    void getExpirySecondsReturnsUnixSeconds() {
        String token = buildToken(Map.of("creator_hash", "abc", "exp", 1_800_000_000L));
        assertThat(helper.getExpirySeconds(token)).isEqualTo(1_800_000_000L);
    }

    @Test
    void validateClaimsResultFactory() {
        assertThat(JwtHelper.ValidationResult.ok().valid()).isTrue();
        assertThat(JwtHelper.ValidationResult.invalid("x").valid()).isFalse();
    }

    @Test
    void validateClaimsHappyPath() {
        String token = buildToken(Map.of(
            "creator_hash", "abc123",
            "fingerprint", "fp",
            "iss", "showad-backend",
            "exp", 1_800_000_000L
        ));
        JwtHelper.ValidationResult result = helper.validateClaims(token, "abc123", "fp");
        assertThat(result.valid()).isTrue();
    }

    @Test
    void validateClaimsRejectsCreatorMismatch() {
        String token = buildToken(Map.of(
            "creator_hash", "wrong",
            "exp", 1_800_000_000L
        ));
        assertThat(helper.validateClaims(token, "abc123", null).reason()).isEqualTo("creator_mismatch");
    }

    @Test
    void validateClaimsRejectsFingerprintMismatch() {
        String token = buildToken(Map.of(
            "creator_hash", "abc",
            "fingerprint", "fp1",
            "exp", 1_800_000_000L
        ));
        assertThat(helper.validateClaims(token, "abc", "fp2").reason()).isEqualTo("fingerprint_mismatch");
    }

    @Test
    void validateClaimsRejectsForeignIssuer() {
        String token = buildToken(Map.of(
            "creator_hash", "abc",
            "iss", "evil",
            "exp", 1_800_000_000L
        ));
        assertThat(helper.validateClaims(token, "abc", null).reason()).isEqualTo("invalid_issuer");
    }

    private String buildToken(Map<String, Object> payload) {
        try {
            String header = base64Url("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
            String body = base64Url(mapper.writeValueAsBytes(new LinkedHashMap<>(payload)));
            String signature = base64Url("dummy-signature".getBytes(StandardCharsets.UTF_8));
            return header + "." + body + "." + signature;
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }

    private String base64Url(byte[] data) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }
}
