package io.proofmark.showad.access;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;

/**
 * Tiny CIDR matcher that works on raw {@link InetAddress} bytes.
 * Supports both IPv4 ({@code /0..32}) and IPv6 ({@code /0..128}).
 *
 * Equivalent to the {@code AccessPolicyEvaluator::ipMatchesCidr} helper from
 * the Laravel SDK, but uses Java's {@code InetAddress} for parsing.
 */
public final class CidrUtils {

    private CidrUtils() {
    }

    public static boolean isInAny(String ip, List<String> cidrs) {
        if (ip == null || ip.isBlank() || cidrs == null || cidrs.isEmpty()) {
            return false;
        }
        for (String cidr : cidrs) {
            if (matches(ip, cidr)) {
                return true;
            }
        }
        return false;
    }

    public static boolean matches(String ip, String cidr) {
        if (ip == null || cidr == null || ip.isBlank() || cidr.isBlank()) {
            return false;
        }

        int slash = cidr.indexOf('/');
        if (slash < 0) {
            return equalsIp(ip, cidr);
        }

        String range = cidr.substring(0, slash);
        String bitsPart = cidr.substring(slash + 1);
        int bits;
        try {
            bits = Integer.parseInt(bitsPart);
        } catch (NumberFormatException ex) {
            return false;
        }

        InetAddress rangeAddr = parse(range);
        InetAddress ipAddr = parse(ip);
        if (rangeAddr == null || ipAddr == null) {
            return false;
        }
        byte[] rangeBytes = rangeAddr.getAddress();
        byte[] ipBytes = ipAddr.getAddress();
        if (rangeBytes.length != ipBytes.length) {
            return false;
        }
        int maxBits = ipBytes.length * 8;
        if (bits < 0 || bits > maxBits) {
            return false;
        }

        int fullBytes = bits / 8;
        int remainder = bits % 8;
        for (int i = 0; i < fullBytes; i++) {
            if (rangeBytes[i] != ipBytes[i]) {
                return false;
            }
        }
        if (remainder == 0) {
            return true;
        }
        int mask = (0xFF << (8 - remainder)) & 0xFF;
        return (rangeBytes[fullBytes] & mask) == (ipBytes[fullBytes] & mask);
    }

    private static boolean equalsIp(String a, String b) {
        InetAddress aAddr = parse(a);
        InetAddress bAddr = parse(b);
        if (aAddr == null || bAddr == null) {
            return false;
        }
        byte[] aBytes = aAddr.getAddress();
        byte[] bBytes = bAddr.getAddress();
        if (aBytes.length != bBytes.length) {
            return false;
        }
        for (int i = 0; i < aBytes.length; i++) {
            if (aBytes[i] != bBytes[i]) {
                return false;
            }
        }
        return true;
    }

    private static InetAddress parse(String value) {
        try {
            return InetAddress.getByName(value);
        } catch (UnknownHostException ex) {
            return null;
        }
    }
}
