package io.proofmark.showad.cookies;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import io.proofmark.showad.ShowAdProperties;
import io.proofmark.showad.jwt.JwtHelper;

/**
 * Reads and writes the {@code showad_*} cookie set used by the SDK family.
 *
 * Behaviour matches the Laravel and Next.js SDKs:
 *   - {@code showad_token} is HTTP-only;
 *   - {@code showad_verified}, {@code showad_creator}, {@code showad_ticket},
 *     {@code showad_expires} are JS-readable;
 *   - all cookies share the same {@code SameSite} and {@code Secure} flags
 *     resolved from configuration.
 */
public class CookieJar {

    private final ShowAdProperties properties;
    private final JwtHelper jwtHelper;

    public CookieJar(ShowAdProperties properties, JwtHelper jwtHelper) {
        this.properties = properties;
        this.jwtHelper = jwtHelper;
    }

    public String read(HttpServletRequest request, String suffix) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        String name = CookieNames.prefixed(properties.getCookie().getPrefix(), suffix);
        for (Cookie cookie : cookies) {
            if (name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    public void writeVerification(HttpServletRequest request, HttpServletResponse response, VerificationCookies data) {
        boolean secure = resolveSecure(request);
        long maxAge = properties.getCookie().getMaxAge();
        String sameSite = properties.getCookie().getSameSite();
        String prefix = properties.getCookie().getPrefix();

        if (data.token() != null) {
            response.addHeader("Set-Cookie", buildCookie(
                CookieNames.prefixed(prefix, CookieNames.TOKEN), data.token(),
                maxAge, true, secure, sameSite));

            response.addHeader("Set-Cookie", buildCookie(
                CookieNames.prefixed(prefix, CookieNames.VERIFIED), "1",
                maxAge, false, secure, sameSite));

            Long expiry = jwtHelper.getExpirySeconds(data.token());
            if (expiry != null) {
                response.addHeader("Set-Cookie", buildCookie(
                    CookieNames.prefixed(prefix, CookieNames.EXPIRES), expiry.toString(),
                    maxAge, false, secure, sameSite));
            }
        }
        if (data.creatorHash() != null) {
            response.addHeader("Set-Cookie", buildCookie(
                CookieNames.prefixed(prefix, CookieNames.CREATOR), data.creatorHash(),
                maxAge, false, secure, sameSite));
        }
        if (data.ticketId() != null) {
            response.addHeader("Set-Cookie", buildCookie(
                CookieNames.prefixed(prefix, CookieNames.TICKET), data.ticketId(),
                maxAge, false, secure, sameSite));
        }
    }

    public void clear(HttpServletRequest request, HttpServletResponse response) {
        boolean secure = resolveSecure(request);
        String sameSite = properties.getCookie().getSameSite();
        String prefix = properties.getCookie().getPrefix();

        String[] suffixes = {
            CookieNames.TOKEN,
            CookieNames.VERIFIED,
            CookieNames.CREATOR,
            CookieNames.TICKET,
            CookieNames.EXPIRES
        };
        for (String suffix : suffixes) {
            boolean httpOnly = CookieNames.TOKEN.equals(suffix);
            response.addHeader("Set-Cookie", buildCookie(
                CookieNames.prefixed(prefix, suffix), "", 0, httpOnly, secure, sameSite));
        }
    }

    private boolean resolveSecure(HttpServletRequest request) {
        Boolean configured = properties.getCookie().getSecure();
        if (configured != null) {
            return configured;
        }
        return request.isSecure();
    }

    private static String buildCookie(String name, String value, long maxAge,
                                      boolean httpOnly, boolean secure, String sameSite) {
        StringBuilder sb = new StringBuilder();
        sb.append(name).append('=').append(value == null ? "" : value);
        sb.append("; Path=/");
        sb.append("; Max-Age=").append(maxAge);
        if (httpOnly) {
            sb.append("; HttpOnly");
        }
        if (secure) {
            sb.append("; Secure");
        }
        if (sameSite != null && !sameSite.isBlank()) {
            sb.append("; SameSite=").append(sameSite);
        }
        return sb.toString();
    }

    /**
     * Bundle of cookie values written together when verification succeeds.
     */
    public record VerificationCookies(String token, String creatorHash, String ticketId) {
    }
}
