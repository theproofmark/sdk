package io.proofmark.showad.url;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import io.proofmark.showad.ShowAdProperties;
import io.proofmark.showad.error.ShowAdException;

/**
 * Builds the URL the SDK redirects unverified visitors to.
 *
 * Format: {@code ${videoAdUrl}/c/{creatorHash}?return_url={url}&sdk=1}.
 */
public class RedirectUrlBuilder {

    private final ShowAdProperties properties;

    public RedirectUrlBuilder(ShowAdProperties properties) {
        this.properties = properties;
    }

    public String build(String returnUrl) {
        if (properties.getCreatorHash() == null || properties.getCreatorHash().isBlank()) {
            throw new ShowAdException(
                "Missing required ShowAd configuration: creatorHash",
                ShowAdException.CONFIG_ERROR);
        }

        String base = stripTrailingSlash(properties.getVideoAdUrl());
        StringBuilder sb = new StringBuilder(base.length() + 80);
        sb.append(base)
          .append("/c/")
          .append(URLEncoder.encode(properties.getCreatorHash(), StandardCharsets.UTF_8))
          .append("?sdk=1");
        if (returnUrl != null && !returnUrl.isBlank()) {
            sb.append("&return_url=")
              .append(URLEncoder.encode(returnUrl, StandardCharsets.UTF_8));
        }
        return sb.toString();
    }

    public static String removeQueryParam(String fullUrl, String param) {
        if (fullUrl == null) {
            return null;
        }
        int qIdx = fullUrl.indexOf('?');
        if (qIdx < 0) {
            return fullUrl;
        }
        String base = fullUrl.substring(0, qIdx);
        String query = fullUrl.substring(qIdx + 1);

        int fragmentIdx = query.indexOf('#');
        String fragment = "";
        if (fragmentIdx >= 0) {
            fragment = query.substring(fragmentIdx);
            query = query.substring(0, fragmentIdx);
        }

        StringBuilder rebuilt = new StringBuilder();
        for (String pair : query.split("&")) {
            if (pair.isEmpty()) {
                continue;
            }
            int eq = pair.indexOf('=');
            String key = eq < 0 ? pair : pair.substring(0, eq);
            if (key.equals(param)) {
                continue;
            }
            if (rebuilt.length() > 0) {
                rebuilt.append('&');
            }
            rebuilt.append(pair);
        }

        StringBuilder out = new StringBuilder(base);
        if (rebuilt.length() > 0) {
            out.append('?').append(rebuilt);
        }
        out.append(fragment);
        return out.toString();
    }

    private static String stripTrailingSlash(String value) {
        if (value == null) {
            return "";
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
