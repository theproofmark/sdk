package io.proofmark.showad;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.proofmark.showad.access.AccessPolicyEvaluator;
import io.proofmark.showad.api.ClaimTicketResponse;
import io.proofmark.showad.api.ValidateTokenResponse;
import io.proofmark.showad.cookies.CookieJar;
import io.proofmark.showad.error.ShowAdException;
import io.proofmark.showad.jwt.JwtHelper;
import io.proofmark.showad.url.RedirectUrlBuilder;

class ShowAdFilterTest {

    private static final String CREATOR_HASH = "creator-abc";

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Clock fixedClock = Clock.fixed(Instant.ofEpochSecond(1_700_000_000L), ZoneOffset.UTC);

    private ShowAdProperties properties;
    private ShowAdHttpClient httpClient;
    private ShowAdFilter filter;

    @BeforeEach
    void setUp() {
        properties = new ShowAdProperties();
        properties.setEnabled(true);
        properties.setCreatorHash(CREATOR_HASH);
        properties.setApiKey("api-key");
        properties.setRedirectSecret("redirect-secret");
        properties.setProtectedPaths(List.of("/premium/**", "/locked"));
        properties.setExcludedPaths(List.of("/health"));

        httpClient = mock(ShowAdHttpClient.class);
        JwtHelper jwtHelper = new JwtHelper(objectMapper, fixedClock);
        CookieJar cookieJar = new CookieJar(properties, jwtHelper);
        RedirectUrlBuilder redirectUrlBuilder = new RedirectUrlBuilder(properties);
        AccessPolicyEvaluator accessPolicyEvaluator = new AccessPolicyEvaluator();

        filter = new ShowAdFilter(properties, httpClient, jwtHelper, cookieJar, redirectUrlBuilder, accessPolicyEvaluator);
    }

    @Test
    void unprotectedPathIsAllowed() throws Exception {
        MockHttpServletRequest request = newRequest("/public/index", null);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    void excludedPathIsAllowed() throws Exception {
        MockHttpServletRequest request = newRequest("/health", null);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    void noTokenRedirectsToVideoAd() throws Exception {
        MockHttpServletRequest request = newRequest("/premium/article", null);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(302);
        String location = response.getRedirectedUrl();
        assertThat(location).startsWith("https://showad.proofmark.io/c/" + CREATOR_HASH);
        assertThat(location).contains("sdk=1");
        assertThat(location).contains("return_url=");
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    void validTokenAllowsAccess() throws Exception {
        String token = makeJwt(Map.of(
            "creator_hash", CREATOR_HASH,
            "fingerprint", "fp",
            "iss", "showad-backend",
            "exp", 1_800_000_000L
        ));
        ValidateTokenResponse validate = new ValidateTokenResponse();
        validate.setValid(true);
        validate.setCreatorHash(CREATOR_HASH);
        when(httpClient.validateToken(eq(token))).thenReturn(validate);

        MockHttpServletRequest request = newRequest("/premium/article", null);
        request.setCookies(
            new Cookie("showad_fingerprint", "fp"),
            new Cookie("showad_token", token),
            new Cookie("showad_creator", CREATOR_HASH),
            new Cookie("showad_verified", "1"),
            new Cookie("showad_expires", "1800000000")
        );
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(chain.getRequest()).isNotNull();
        verify(httpClient).validateToken(eq(token));
    }

    @Test
    void expiredTokenRedirectsAndClearsCookies() throws Exception {
        String token = makeJwt(Map.of(
            "creator_hash", CREATOR_HASH,
            "exp", 1_500_000_000L
        ));
        MockHttpServletRequest request = newRequest("/premium/article", null);
        request.setCookies(
            new Cookie("showad_fingerprint", "fp"),
            new Cookie("showad_token", token)
        );
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(302);
        List<String> setCookies = response.getHeaders("Set-Cookie");
        assertThat(setCookies).anyMatch(c -> c.startsWith("showad_token=") && c.contains("Max-Age=0"));
    }

    @Test
    void redirectTicketClaimsAndSetsCookies() throws Exception {
        ClaimTicketResponse claim = new ClaimTicketResponse();
        String token = makeJwt(Map.of(
            "creator_hash", CREATOR_HASH,
            "fingerprint", "fp",
            "iss", "showad-backend",
            "exp", 1_800_000_000L
        ));
        claim.setToken(token);
        claim.setCreatorHash(CREATOR_HASH);
        claim.setTicketId("ticket-123");
        when(httpClient.claimRedirectTicket("ticket-123")).thenReturn(claim);

        MockHttpServletRequest request = newRequest("/premium/article", "redirect_ticket=ticket-123");
        request.setCookies(new Cookie("showad_fingerprint", "fp"));

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(302);
        assertThat(response.getRedirectedUrl()).doesNotContain("redirect_ticket=");
        List<String> setCookies = response.getHeaders("Set-Cookie");
        assertThat(setCookies).anyMatch(c -> c.startsWith("showad_token=" + token) && c.contains("HttpOnly"));
        assertThat(setCookies).anyMatch(c -> c.startsWith("showad_verified=1"));
        assertThat(setCookies).anyMatch(c -> c.startsWith("showad_creator=" + CREATOR_HASH));
        assertThat(setCookies).anyMatch(c -> c.startsWith("showad_ticket=ticket-123"));
    }

    @Test
    void redirectTicketClaimFailureRedirectsToVideoAd() throws Exception {
        when(httpClient.claimRedirectTicket("bad-ticket"))
            .thenThrow(new ShowAdException("ticket gone", ShowAdException.TICKET_NOT_FOUND));

        MockHttpServletRequest request = newRequest("/premium/article", "redirect_ticket=bad-ticket");
        request.setCookies(new Cookie("showad_fingerprint", "fp"));

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(302);
        assertThat(response.getRedirectedUrl()).startsWith("https://showad.proofmark.io/c/" + CREATOR_HASH);
    }

    @Test
    void backendValidationCanRejectToken() throws Exception {
        when(httpClient.validateToken(org.mockito.ArgumentMatchers.anyString()))
            .thenThrow(new ShowAdException("invalid", ShowAdException.TOKEN_INVALID));

        String token = makeJwt(Map.of(
            "creator_hash", CREATOR_HASH,
            "fingerprint", "fp",
            "iss", "showad-backend",
            "exp", 1_800_000_000L
        ));

        MockHttpServletRequest request = newRequest("/premium/article", null);
        request.setCookies(
            new Cookie("showad_fingerprint", "fp"),
            new Cookie("showad_token", token),
            new Cookie("showad_creator", CREATOR_HASH),
            new Cookie("showad_verified", "1"),
            new Cookie("showad_expires", "1800000000")
        );
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(302);
        assertThat(response.getRedirectedUrl()).startsWith("https://showad.proofmark.io/c/");
    }

    private MockHttpServletRequest newRequest(String path, String queryString) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.setServerName("example.com");
        request.setScheme("https");
        request.setSecure(true);
        request.setServerPort(443);
        request.setRequestURI(path);
        if (queryString != null) {
            request.setQueryString(queryString);
            for (String pair : queryString.split("&")) {
                int eq = pair.indexOf('=');
                if (eq > 0) {
                    request.setParameter(pair.substring(0, eq), pair.substring(eq + 1));
                }
            }
        }
        return request;
    }

    private String makeJwt(Map<String, Object> payload) {
        try {
            String header = base64Url("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
            String body = base64Url(objectMapper.writeValueAsBytes(new LinkedHashMap<>(payload)));
            String signature = base64Url("dummy".getBytes(StandardCharsets.UTF_8));
            return header + "." + body + "." + signature;
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }

    private String base64Url(byte[] data) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }
}
