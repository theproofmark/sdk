package io.proofmark.showad;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import io.proofmark.showad.access.AccessPolicy;
import io.proofmark.showad.access.AccessPolicyEvaluator;

class AccessPolicyEvaluatorTest {

    private final AccessPolicyEvaluator evaluator = new AccessPolicyEvaluator();

    @Test
    void disabledPolicyContinues() {
        ShowAdProperties.AccessPolicy config = new ShowAdProperties.AccessPolicy();
        config.setEnabled(false);

        AccessPolicy decision = evaluator.evaluate(new MockHttpServletRequest(), config);
        assertThat(decision.action()).isEqualTo(AccessPolicy.Action.CONTINUE);
    }

    @Test
    void cidrAllowlistAllows() {
        ShowAdProperties.AccessPolicy config = new ShowAdProperties.AccessPolicy();
        config.setEnabled(true);
        config.setAllowCidrs(List.of("10.0.0.0/8"));
        config.setTrustedIpHeaders(List.of("X-Forwarded-For"));

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Forwarded-For", "10.5.5.5, 1.2.3.4");

        AccessPolicy decision = evaluator.evaluate(request, config);
        assertThat(decision.action()).isEqualTo(AccessPolicy.Action.ALLOW);
        assertThat(decision.reason()).isEqualTo("cidr_allowlist");
    }

    @Test
    void uaAloneDoesNotBypass() {
        ShowAdProperties.AccessPolicy config = new ShowAdProperties.AccessPolicy();
        config.setEnabled(true);
        config.getCrawler().setEnabled(true);
        config.getCrawler().setFamilyCidrs(Map.of("google", List.of("66.249.64.0/19")));

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("User-Agent", "Googlebot/2.1");
        request.setRemoteAddr("203.0.113.5");

        AccessPolicy decision = evaluator.evaluate(request, config);
        assertThat(decision.action()).isEqualTo(AccessPolicy.Action.CONTINUE);
    }

    @Test
    void verifiedCrawlerCidrAllows() {
        ShowAdProperties.AccessPolicy config = new ShowAdProperties.AccessPolicy();
        config.setEnabled(true);
        config.getCrawler().setEnabled(true);
        config.getCrawler().setFamilyCidrs(Map.of("google", List.of("66.249.64.0/19")));

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("User-Agent", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://google.com)");
        request.setRemoteAddr("66.249.66.1");

        AccessPolicy decision = evaluator.evaluate(request, config);
        assertThat(decision.action()).isEqualTo(AccessPolicy.Action.ALLOW);
        assertThat(decision.reason()).isEqualTo("crawler:google");
    }

    @Test
    void cloudflareVerifiedBotAllowsWithUaMatch() {
        ShowAdProperties.AccessPolicy config = new ShowAdProperties.AccessPolicy();
        config.setEnabled(true);
        config.getCrawler().setEnabled(true);
        config.getCrawler().setAllowCloudflareVerifiedBot(true);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("User-Agent", "Bingbot");
        request.addHeader("CF-Verified-Bot", "true");
        request.setRemoteAddr("172.69.1.1");

        AccessPolicy decision = evaluator.evaluate(request, config);
        assertThat(decision.action()).isEqualTo(AccessPolicy.Action.ALLOW);
        assertThat(decision.reason()).isEqualTo("crawler:bing");
    }

    @Test
    void resolveClientIpPrefersTrustedHeader() {
        ShowAdProperties.AccessPolicy config = new ShowAdProperties.AccessPolicy();
        config.setTrustedIpHeaders(List.of("X-Forwarded-For"));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Forwarded-For", "1.1.1.1, 2.2.2.2");
        request.setRemoteAddr("9.9.9.9");

        String ip = evaluator.resolveClientIp(request, config.getTrustedIpHeaders());
        assertThat(ip).isEqualTo("1.1.1.1");
    }

    @Test
    void defaultTrustedIpHeadersDoNotTrustForwardedHeaders() {
        ShowAdProperties.AccessPolicy config = new ShowAdProperties.AccessPolicy();
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Forwarded-For", "1.1.1.1");
        request.setRemoteAddr("9.9.9.9");

        String ip = evaluator.resolveClientIp(request, config.getTrustedIpHeaders());
        assertThat(ip).isEqualTo("9.9.9.9");
    }

    @Test
    void resolveClientIpFallsBackToRemoteAddr() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("9.9.9.9");

        String ip = evaluator.resolveClientIp(request, List.of("X-Forwarded-For"));
        assertThat(ip).isEqualTo("9.9.9.9");
    }
}
