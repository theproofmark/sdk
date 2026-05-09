package io.proofmark.showad;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import io.proofmark.showad.access.CidrUtils;

class CidrUtilsTest {

    @Test
    void exactIPv4Match() {
        assertThat(CidrUtils.matches("66.249.66.1", "66.249.66.1")).isTrue();
        assertThat(CidrUtils.matches("66.249.66.1", "66.249.66.2")).isFalse();
    }

    @Test
    void cidrIPv4InsideRange() {
        assertThat(CidrUtils.matches("66.249.66.1", "66.249.64.0/19")).isTrue();
        assertThat(CidrUtils.matches("66.249.96.1", "66.249.64.0/19")).isFalse();
    }

    @Test
    void cidrIPv4ZeroMaskMatchesEverything() {
        assertThat(CidrUtils.matches("8.8.8.8", "0.0.0.0/0")).isTrue();
    }

    @Test
    void cidrIPv6InsideRange() {
        assertThat(CidrUtils.matches("2001:4860:4801::1", "2001:4860:4801::/48")).isTrue();
        assertThat(CidrUtils.matches("2001:4860:4802::1", "2001:4860:4801::/48")).isFalse();
    }

    @Test
    void invalidInputsReturnFalse() {
        assertThat(CidrUtils.matches("not-an-ip", "10.0.0.0/8")).isFalse();
        assertThat(CidrUtils.matches("10.0.0.1", "not-a-cidr")).isFalse();
        assertThat(CidrUtils.matches("10.0.0.1", "10.0.0.0/abc")).isFalse();
        assertThat(CidrUtils.matches("10.0.0.1", "10.0.0.0/40")).isFalse();
    }

    @Test
    void isInAnyShortCircuits() {
        List<String> cidrs = List.of("203.0.113.0/24", "66.249.64.0/19");
        assertThat(CidrUtils.isInAny("66.249.66.1", cidrs)).isTrue();
        assertThat(CidrUtils.isInAny("198.51.100.1", cidrs)).isFalse();
        assertThat(CidrUtils.isInAny(null, cidrs)).isFalse();
        assertThat(CidrUtils.isInAny("66.249.66.1", List.of())).isFalse();
    }

    @Test
    void mismatchedFamiliesAreRejected() {
        assertThat(CidrUtils.matches("66.249.66.1", "::1/128")).isFalse();
    }
}
