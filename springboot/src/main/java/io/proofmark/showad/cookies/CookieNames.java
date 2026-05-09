package io.proofmark.showad.cookies;

/**
 * Cookie name suffixes used by ShowAd. The full cookie name is built by
 * prefixing each suffix with the configured cookie prefix (default {@code showad}).
 */
public final class CookieNames {

    public static final String FINGERPRINT = "fingerprint";
    public static final String TOKEN = "token";
    public static final String CREATOR = "creator";
    public static final String TICKET = "ticket";
    public static final String VERIFIED = "verified";
    public static final String EXPIRES = "expires";
    public static final String META = "meta";

    private CookieNames() {
    }

    public static String prefixed(String prefix, String suffix) {
        String safePrefix = (prefix == null || prefix.isBlank()) ? "showad" : prefix;
        return safePrefix + "_" + suffix;
    }
}
