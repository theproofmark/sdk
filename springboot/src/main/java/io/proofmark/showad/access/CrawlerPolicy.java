package io.proofmark.showad.access;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Verified crawler configuration. UA matches alone never bypass verification:
 * an IP must additionally match either the configured CIDR list for the family
 * or the Cloudflare verified-bot header (when enabled).
 */
public final class CrawlerPolicy {

    public static final Map<String, List<String>> DEFAULT_USER_AGENTS;

    static {
        Map<String, List<String>> defaults = new LinkedHashMap<>();
        defaults.put("google", List.of("googlebot", "google-inspectiontool", "apis-google"));
        defaults.put("bing", List.of("bingbot"));
        defaults.put("duckduckgo", List.of("duckduckbot"));
        defaults.put("yandex", List.of("yandexbot"));
        defaults.put("baidu", List.of("baiduspider"));
        defaults.put("openai", List.of("gptbot", "chatgpt-user", "oai-searchbot"));
        defaults.put("anthropic", List.of("claudebot", "anthropic-ai"));
        defaults.put("perplexity", List.of("perplexitybot"));
        defaults.put("commoncrawl", List.of("ccbot"));
        defaults.put("facebook", List.of("facebookexternalhit", "facebot"));
        defaults.put("twitter", List.of("twitterbot"));
        defaults.put("linkedin", List.of("linkedinbot"));
        DEFAULT_USER_AGENTS = Collections.unmodifiableMap(defaults);
    }

    private final boolean enabled;
    private final boolean allowCloudflareVerifiedBot;
    private final List<String> families;
    private final Map<String, List<String>> userAgents;
    private final Map<String, List<String>> familyCidrs;

    public CrawlerPolicy(
        boolean enabled,
        boolean allowCloudflareVerifiedBot,
        List<String> families,
        Map<String, List<String>> userAgents,
        Map<String, List<String>> familyCidrs
    ) {
        this.enabled = enabled;
        this.allowCloudflareVerifiedBot = allowCloudflareVerifiedBot;
        this.userAgents = (userAgents == null || userAgents.isEmpty())
            ? DEFAULT_USER_AGENTS
            : Map.copyOf(userAgents);
        this.families = (families == null || families.isEmpty())
            ? List.copyOf(this.userAgents.keySet())
            : List.copyOf(families);
        this.familyCidrs = familyCidrs == null ? Map.of() : Map.copyOf(familyCidrs);
    }

    public boolean isEnabled() { return enabled; }
    public boolean isAllowCloudflareVerifiedBot() { return allowCloudflareVerifiedBot; }
    public List<String> getFamilies() { return families; }
    public Map<String, List<String>> getUserAgents() { return userAgents; }
    public Map<String, List<String>> getFamilyCidrs() { return familyCidrs; }

    public String matchFamily(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return null;
        }
        String needle = userAgent.toLowerCase(Locale.ROOT);
        for (String family : families) {
            List<String> fragments = userAgents.getOrDefault(family, List.of());
            for (String fragment : fragments) {
                if (fragment != null && !fragment.isEmpty()
                    && needle.contains(fragment.toLowerCase(Locale.ROOT))) {
                    return family;
                }
            }
        }
        return null;
    }
}
