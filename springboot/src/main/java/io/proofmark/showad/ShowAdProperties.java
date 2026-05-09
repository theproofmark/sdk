package io.proofmark.showad;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;

import io.proofmark.showad.access.CrawlerPolicy;

/**
 * Configuration properties for the ShowAd Spring Boot starter.
 *
 * Bound from {@code showad.*} keys in {@code application.yml} / {@code application.properties}.
 * The defaults match the wire protocol shared with the Laravel and Next.js SDKs.
 */
@ConfigurationProperties(prefix = "showad")
public class ShowAdProperties {

    /**
     * Master switch for the ShowAd auto-configuration. The filter is only
     * registered when this is {@code true}.
     */
    private boolean enabled = false;

    /**
     * Creator hash that identifies the publisher inside ProofMark.
     */
    private String creatorHash;

    /**
     * Public API key issued to the publisher.
     */
    private String apiKey;

    /**
     * Shared secret used to claim redirect tickets.
     */
    private String redirectSecret;

    /**
     * Backend API base URL. Defaults to https://ad.proofmark.io.
     */
    private String apiBaseUrl = "https://ad.proofmark.io";

    /**
     * Video ad frontend base URL. Defaults to https://showad.proofmark.io.
     */
    private String videoAdUrl = "https://showad.proofmark.io";

    /**
     * Glob-style URL patterns that should be protected by ShowAd. {@code *}
     * matches anything except slash boundaries. Empty list disables the filter.
     */
    private List<String> protectedPaths = new ArrayList<>();

    /**
     * Glob-style URL patterns that should never be protected (e.g. health checks).
     */
    private List<String> excludedPaths = new ArrayList<>();

    /**
     * Whether to validate tokens against the backend on every protected request
     * (in addition to local JWT decode + claim checks).
     */
    private boolean validateOnBackend = true;

    /**
     * Emit verbose logs for the verification pipeline.
     */
    private boolean debug = false;

    private final Cookie cookie = new Cookie();
    private final Http http = new Http();
    private final AccessPolicy accessPolicy = new AccessPolicy();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public String getCreatorHash() { return creatorHash; }
    public void setCreatorHash(String creatorHash) { this.creatorHash = creatorHash; }

    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }

    public String getRedirectSecret() { return redirectSecret; }
    public void setRedirectSecret(String redirectSecret) { this.redirectSecret = redirectSecret; }

    public String getApiBaseUrl() { return apiBaseUrl; }
    public void setApiBaseUrl(String apiBaseUrl) { this.apiBaseUrl = apiBaseUrl; }

    public String getVideoAdUrl() { return videoAdUrl; }
    public void setVideoAdUrl(String videoAdUrl) { this.videoAdUrl = videoAdUrl; }

    public List<String> getProtectedPaths() { return protectedPaths; }
    public void setProtectedPaths(List<String> protectedPaths) { this.protectedPaths = protectedPaths; }

    public List<String> getExcludedPaths() { return excludedPaths; }
    public void setExcludedPaths(List<String> excludedPaths) { this.excludedPaths = excludedPaths; }

    public boolean isValidateOnBackend() { return validateOnBackend; }
    public void setValidateOnBackend(boolean validateOnBackend) { this.validateOnBackend = validateOnBackend; }

    public boolean isDebug() { return debug; }
    public void setDebug(boolean debug) { this.debug = debug; }

    public Cookie getCookie() { return cookie; }
    public Http getHttp() { return http; }
    public AccessPolicy getAccessPolicy() { return accessPolicy; }

    /**
     * Cookie configuration block.
     */
    public static class Cookie {
        private String prefix = "showad";
        private long maxAge = 3600;
        private Boolean secure;
        private String sameSite = "Lax";

        public String getPrefix() { return prefix; }
        public void setPrefix(String prefix) { this.prefix = prefix; }
        public long getMaxAge() { return maxAge; }
        public void setMaxAge(long maxAge) { this.maxAge = maxAge; }
        public Boolean getSecure() { return secure; }
        public void setSecure(Boolean secure) { this.secure = secure; }
        public String getSameSite() { return sameSite; }
        public void setSameSite(String sameSite) { this.sameSite = sameSite; }
    }

    /**
     * Outbound HTTP client tuning.
     */
    public static class Http {
        private long connectTimeoutMillis = 5000;
        private long readTimeoutMillis = 10000;

        public long getConnectTimeoutMillis() { return connectTimeoutMillis; }
        public void setConnectTimeoutMillis(long connectTimeoutMillis) { this.connectTimeoutMillis = connectTimeoutMillis; }
        public long getReadTimeoutMillis() { return readTimeoutMillis; }
        public void setReadTimeoutMillis(long readTimeoutMillis) { this.readTimeoutMillis = readTimeoutMillis; }
    }

    /**
     * Access policy configuration: trusted proxies, CIDR allow-list, and verified
     * crawler families.
     */
    public static class AccessPolicy {
        private boolean enabled = false;
        private List<String> trustedIpHeaders = new ArrayList<>();
        private List<String> allowCidrs = new ArrayList<>();
        private final Crawler crawler = new Crawler();

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public List<String> getTrustedIpHeaders() { return trustedIpHeaders; }
        public void setTrustedIpHeaders(List<String> trustedIpHeaders) { this.trustedIpHeaders = trustedIpHeaders; }
        public List<String> getAllowCidrs() { return allowCidrs; }
        public void setAllowCidrs(List<String> allowCidrs) { this.allowCidrs = allowCidrs; }
        public Crawler getCrawler() { return crawler; }
    }

    /**
     * Verified crawler configuration. UA alone never bypasses; an IP/CIDR or a
     * Cloudflare verified-bot signal is required in addition to a UA family
     * match.
     */
    public static class Crawler {
        private boolean enabled = false;
        private boolean allowCloudflareVerifiedBot = false;
        private List<String> families = new ArrayList<>();
        private Map<String, List<String>> userAgents = new LinkedHashMap<>();
        private Map<String, List<String>> familyCidrs = new LinkedHashMap<>();

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public boolean isAllowCloudflareVerifiedBot() { return allowCloudflareVerifiedBot; }
        public void setAllowCloudflareVerifiedBot(boolean allowCloudflareVerifiedBot) { this.allowCloudflareVerifiedBot = allowCloudflareVerifiedBot; }
        public List<String> getFamilies() { return families; }
        public void setFamilies(List<String> families) { this.families = families; }
        public Map<String, List<String>> getUserAgents() { return userAgents; }
        public void setUserAgents(Map<String, List<String>> userAgents) { this.userAgents = userAgents; }
        public Map<String, List<String>> getFamilyCidrs() { return familyCidrs; }
        public void setFamilyCidrs(Map<String, List<String>> familyCidrs) { this.familyCidrs = familyCidrs; }

        public CrawlerPolicy toCrawlerPolicy() {
            return new CrawlerPolicy(
                enabled,
                allowCloudflareVerifiedBot,
                families,
                userAgents,
                familyCidrs
            );
        }
    }
}
