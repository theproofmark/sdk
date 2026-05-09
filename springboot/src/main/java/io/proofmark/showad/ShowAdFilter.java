package io.proofmark.showad;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;

import io.proofmark.showad.access.AccessPolicy;
import io.proofmark.showad.access.AccessPolicyEvaluator;
import io.proofmark.showad.api.ClaimTicketResponse;
import io.proofmark.showad.api.ValidateTokenResponse;
import io.proofmark.showad.cookies.CookieJar;
import io.proofmark.showad.cookies.CookieNames;
import io.proofmark.showad.error.ShowAdException;
import io.proofmark.showad.jwt.JwtHelper;
import io.proofmark.showad.path.PathMatcher;
import io.proofmark.showad.url.RedirectUrlBuilder;

/**
 * Servlet filter that enforces the ShowAd verification flow.
 *
 * Pipeline (preserves order across SDKs):
 *   1. Path match (excluded -> allow; not protected -> allow).
 *   2. Access policy evaluation.
 *   3. Redirect ticket claim if {@code redirect_ticket} is present in the URL.
 *   4. Local JWT decode + claim validation against {@code showad_token} cookie.
 *   5. Backend validation when {@code showad.validate-on-backend=true}.
 *   6. Otherwise redirect to {@code ${videoAdUrl}/c/{creatorHash}}.
 */
public class ShowAdFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(ShowAdFilter.class);

    private final ShowAdProperties properties;
    private final ShowAdHttpClient httpClient;
    private final JwtHelper jwtHelper;
    private final CookieJar cookieJar;
    private final RedirectUrlBuilder redirectUrlBuilder;
    private final AccessPolicyEvaluator accessPolicyEvaluator;

    public ShowAdFilter(
        ShowAdProperties properties,
        ShowAdHttpClient httpClient,
        JwtHelper jwtHelper,
        CookieJar cookieJar,
        RedirectUrlBuilder redirectUrlBuilder,
        AccessPolicyEvaluator accessPolicyEvaluator
    ) {
        this.properties = properties;
        this.httpClient = httpClient;
        this.jwtHelper = jwtHelper;
        this.cookieJar = cookieJar;
        this.redirectUrlBuilder = redirectUrlBuilder;
        this.accessPolicyEvaluator = accessPolicyEvaluator;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {

        String path = request.getRequestURI();

        if (PathMatcher.matchesAny(path, properties.getExcludedPaths())) {
            chain.doFilter(request, response);
            return;
        }

        if (!properties.getProtectedPaths().isEmpty()
            && !PathMatcher.matchesAny(path, properties.getProtectedPaths())) {
            chain.doFilter(request, response);
            return;
        }

        debug("Processing protected path: {}", path);

        AccessPolicy decision = accessPolicyEvaluator.evaluate(request, properties.getAccessPolicy());
        if (decision.action() == AccessPolicy.Action.ALLOW) {
            debug("Access policy bypass: {}", decision.reason());
            chain.doFilter(request, response);
            return;
        }
        if (decision.action() == AccessPolicy.Action.REDIRECT) {
            String target = decision.redirectUrl() != null
                ? decision.redirectUrl()
                : redirectUrlBuilder.build(currentUrl(request));
            response.sendRedirect(target);
            return;
        }

        String fingerprint = cookieJar.read(request, CookieNames.FINGERPRINT);
        String existingToken = cookieJar.read(request, CookieNames.TOKEN);
        String storedCreator = cookieJar.read(request, CookieNames.CREATOR);
        String existingVerified = cookieJar.read(request, CookieNames.VERIFIED);
        String existingExpires = cookieJar.read(request, CookieNames.EXPIRES);

        String redirectTicket = request.getParameter("redirect_ticket");

        if (redirectTicket != null && !redirectTicket.isBlank()) {
            handleRedirectTicket(request, response, redirectTicket, fingerprint);
            return;
        }

        if (existingToken != null && !existingToken.isBlank()) {
            handleExistingToken(request, response, chain, existingToken, fingerprint,
                existingVerified, storedCreator, existingExpires);
            return;
        }

        debug("No verification found - redirecting to video ad");
        redirectToVideoAd(request, response);
    }

    private void handleRedirectTicket(
        HttpServletRequest request, HttpServletResponse response,
        String ticketId, String fingerprint
    ) throws IOException {
        debug("Found redirect ticket: {}", ticketId);

        if (fingerprint == null || fingerprint.isBlank()) {
            debug("Ticket present without fingerprint - redirecting to video ad");
            redirectToVideoAd(request, response);
            return;
        }

        try {
            ClaimTicketResponse claim = httpClient.claimRedirectTicket(ticketId);

            if (claim.getToken() == null || claim.getToken().isBlank()) {
                debug("Ticket claim missing token");
                redirectToVideoAd(request, response);
                return;
            }
            String expectedCreator = properties.getCreatorHash();
            if (claim.getCreatorHash() == null || !claim.getCreatorHash().equals(expectedCreator)) {
                debug("Creator hash mismatch on ticket claim");
                redirectToVideoAd(request, response);
                return;
            }

            String cleanUrl = RedirectUrlBuilder.removeQueryParam(currentUrl(request), "redirect_ticket");
            cookieJar.writeVerification(request, response, new CookieJar.VerificationCookies(
                claim.getToken(),
                claim.getCreatorHash() == null ? expectedCreator : claim.getCreatorHash(),
                claim.getTicketId() == null ? ticketId : claim.getTicketId()
            ));
            response.sendRedirect(cleanUrl);
        } catch (ShowAdException ex) {
            log.warn("[ShowAd] Ticket claim failed: {} ({})", ex.getMessage(), ex.getErrorName());
            redirectToVideoAd(request, response);
        }
    }

    private void handleExistingToken(
        HttpServletRequest request, HttpServletResponse response, FilterChain chain,
        String token, String fingerprint, String existingVerified,
        String storedCreator, String existingExpires
    ) throws ServletException, IOException {
        debug("Checking existing token");

        if (jwtHelper.isExpired(token)) {
            debug("Token expired");
            redirectToVideoAd(request, response);
            return;
        }

        JwtHelper.ValidationResult validation = jwtHelper.validateClaims(
            token, properties.getCreatorHash(), fingerprint);
        if (!validation.valid()) {
            debug("Token validation failed: {}", validation.reason());
            redirectToVideoAd(request, response);
            return;
        }

        if (properties.isValidateOnBackend()) {
            try {
                ValidateTokenResponse backendValidation = httpClient.validateToken(token);
                if (backendValidation == null || !backendValidation.isValid()) {
                    debug("Backend validation rejected token");
                    redirectToVideoAd(request, response);
                    return;
                }
            } catch (ShowAdException ex) {
                debug("Backend validation rejected token: {}", ex.getErrorName());
                redirectToVideoAd(request, response);
                return;
            } catch (RuntimeException ex) {
                debug("Backend validation failed: {}", ex.getClass().getSimpleName());
                redirectToVideoAd(request, response);
                return;
            }
        }

        debug("Token valid - allowing access");

        Long tokenExpiry = jwtHelper.getExpirySeconds(token);
        String expectedCreator = properties.getCreatorHash();
        boolean needsRefresh = !"1".equals(existingVerified)
            || !expectedCreator.equals(storedCreator)
            || (tokenExpiry != null && !String.valueOf(tokenExpiry).equals(existingExpires));

        if (needsRefresh) {
            String ticketId = cookieJar.read(request, CookieNames.TICKET);
            cookieJar.writeVerification(request, response, new CookieJar.VerificationCookies(
                token, expectedCreator, ticketId));
        }

        chain.doFilter(request, response);
    }

    private void redirectToVideoAd(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String returnUrl = currentUrl(request);
        String redirectUrl = redirectUrlBuilder.build(returnUrl);
        cookieJar.clear(request, response);
        response.sendRedirect(redirectUrl);
    }

    private static String currentUrl(HttpServletRequest request) {
        StringBuilder url = new StringBuilder(request.getRequestURL());
        if (request.getQueryString() != null) {
            url.append('?').append(request.getQueryString());
        }
        return url.toString();
    }

    private void debug(String message, Object... args) {
        if (properties.isDebug() && log.isInfoEnabled()) {
            log.info("[ShowAd] " + message, args);
        }
    }
}
