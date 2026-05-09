package io.proofmark.showad.access;

import java.util.List;
import java.util.Locale;

import jakarta.servlet.http.HttpServletRequest;

import io.proofmark.showad.ShowAdProperties;

/**
 * Server-only access policy evaluator that runs before any ShowAd verification.
 *
 * Pipeline (in order):
 *   1. Verified crawler (UA family + IP CIDR or Cloudflare verified-bot header).
 *   2. CIDR allow-list resolved against a trusted IP header.
 *
 * Returns {@link AccessPolicy#cont()} when the request must continue through
 * the normal verification pipeline.
 */
public class AccessPolicyEvaluator {

    public AccessPolicy evaluate(HttpServletRequest request, ShowAdProperties.AccessPolicy config) {
        if (config == null || !config.isEnabled()) {
            return AccessPolicy.cont();
        }

        String clientIp = resolveClientIp(request, config.getTrustedIpHeaders());
        String userAgent = nullSafe(request.getHeader("User-Agent"));

        CrawlerPolicy crawlerPolicy = config.getCrawler().toCrawlerPolicy();
        AccessPolicy crawler = verifyCrawler(request, clientIp, userAgent, crawlerPolicy);
        if (crawler.action() == AccessPolicy.Action.ALLOW) {
            return crawler;
        }

        if (clientIp != null && CidrUtils.isInAny(clientIp, config.getAllowCidrs())) {
            return AccessPolicy.allow("cidr_allowlist");
        }

        return AccessPolicy.cont();
    }

    public String resolveClientIp(HttpServletRequest request, List<String> trustedIpHeaders) {
        if (trustedIpHeaders != null) {
            for (String header : trustedIpHeaders) {
                String value = request.getHeader(header);
                if (value == null || value.isBlank()) {
                    continue;
                }
                String first = value.split(",")[0].trim();
                if (!first.isEmpty()) {
                    return first;
                }
            }
        }
        return request.getRemoteAddr();
    }

    public AccessPolicy verifyCrawler(
        HttpServletRequest request,
        String clientIp,
        String userAgent,
        CrawlerPolicy policy
    ) {
        if (policy == null || !policy.isEnabled()) {
            return AccessPolicy.cont();
        }

        String family = policy.matchFamily(userAgent);
        if (family == null) {
            return AccessPolicy.cont();
        }

        if (clientIp == null || clientIp.isBlank()) {
            return AccessPolicy.cont();
        }

        if (policy.isAllowCloudflareVerifiedBot() && request != null) {
            String verifiedBot = request.getHeader("CF-Verified-Bot");
            if (verifiedBot == null) {
                verifiedBot = request.getHeader("X-ProofMark-CF-Verified-Bot");
            }
            if (verifiedBot != null && isTruthy(verifiedBot)) {
                return AccessPolicy.allow("crawler:" + family);
            }
        }

        List<String> cidrs = policy.getFamilyCidrs().get(family);
        if (cidrs != null && CidrUtils.isInAny(clientIp, cidrs)) {
            return AccessPolicy.allow("crawler:" + family);
        }

        return AccessPolicy.cont();
    }

    private static boolean isTruthy(String value) {
        String v = value.trim().toLowerCase(Locale.ROOT);
        return v.equals("1") || v.equals("true") || v.equals("yes") || v.equals("on");
    }

    private static String nullSafe(String value) {
        return value == null ? "" : value;
    }
}
