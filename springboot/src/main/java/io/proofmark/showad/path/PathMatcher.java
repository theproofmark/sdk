package io.proofmark.showad.path;

import java.util.List;
import java.util.regex.Pattern;

/**
 * Glob-to-regex path matcher consistent with the Laravel and Next.js SDKs.
 *
 * Behaviour:
 *   - both pattern and path are normalised to start with a leading slash;
 *   - {@code *} matches any character including {@code /};
 *   - exact (non-wildcard) patterns must match the path verbatim.
 */
public final class PathMatcher {

    private PathMatcher() {
    }

    public static boolean matches(String path, String pattern) {
        if (path == null || pattern == null) {
            return false;
        }
        String normalisedPath = normalise(path);
        String normalisedPattern = normalise(pattern);

        if (normalisedPath.equals(normalisedPattern)) {
            return true;
        }

        if (normalisedPattern.contains("*")) {
            String regex = Pattern.quote(normalisedPattern)
                .replace("*", "\\E.*\\Q");
            return Pattern.compile("^" + regex + "$").matcher(normalisedPath).matches();
        }

        return false;
    }

    public static boolean matchesAny(String path, List<String> patterns) {
        if (patterns == null || patterns.isEmpty()) {
            return false;
        }
        for (String pattern : patterns) {
            if (matches(path, pattern)) {
                return true;
            }
        }
        return false;
    }

    private static String normalise(String value) {
        if (value.isEmpty()) {
            return "/";
        }
        return value.startsWith("/") ? value : "/" + value;
    }
}
