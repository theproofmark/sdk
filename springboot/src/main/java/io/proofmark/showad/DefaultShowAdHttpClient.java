package io.proofmark.showad;

import java.time.Duration;
import java.util.Map;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import io.proofmark.showad.api.ClaimTicketResponse;
import io.proofmark.showad.api.ValidateTokenResponse;
import io.proofmark.showad.error.ShowAdException;

/**
 * Default {@link ShowAdHttpClient} backed by Spring's {@link RestTemplate}.
 *
 * Maps the documented backend status codes to typed exceptions so the filter
 * pipeline can branch deterministically:
 *   - 410 -> {@link ShowAdException#TICKET_NOT_FOUND}
 *   - 401 -> {@link ShowAdException#TICKET_CLAIM_FAILED}
 *   - 403 -> {@link ShowAdException#CREATOR_MISMATCH}
 *   - network errors -> {@link ShowAdException#NETWORK_ERROR}
 */
public class DefaultShowAdHttpClient implements ShowAdHttpClient {

    private final RestTemplate restTemplate;
    private final ShowAdProperties properties;

    public DefaultShowAdHttpClient(RestTemplateBuilder builder, ShowAdProperties properties) {
        this.properties = properties;
        this.restTemplate = builder
            .setConnectTimeout(Duration.ofMillis(properties.getHttp().getConnectTimeoutMillis()))
            .setReadTimeout(Duration.ofMillis(properties.getHttp().getReadTimeoutMillis()))
            .build();
    }

    public DefaultShowAdHttpClient(RestTemplate restTemplate, ShowAdProperties properties) {
        this.restTemplate = restTemplate;
        this.properties = properties;
    }

    @Override
    public ClaimTicketResponse claimRedirectTicket(String ticketId) {
        requireConfig("creatorHash", properties.getCreatorHash());
        requireConfig("apiKey", properties.getApiKey());
        requireConfig("redirectSecret", properties.getRedirectSecret());

        String url = UriComponentsBuilder.fromHttpUrl(stripTrailingSlash(properties.getApiBaseUrl()))
            .pathSegment("api", "redirect-ticket", ticketId, "claim")
            .toUriString();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Redirect-Ticket-Secret", properties.getRedirectSecret());
        headers.set("X-ShowAd-API-Key", properties.getApiKey());
        headers.set("X-ShowAd-Creator-Hash", properties.getCreatorHash());

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(
            Map.of("creator_hash", properties.getCreatorHash()), headers);

        try {
            ResponseEntity<ClaimTicketResponse> response = restTemplate.exchange(
                url, HttpMethod.POST, entity, ClaimTicketResponse.class);
            ClaimTicketResponse body = response.getBody();
            if (body == null || isBlank(body.getToken()) || isBlank(body.getCreatorHash())) {
                throw new ShowAdException(
                    "Invalid ticket claim response from ShowAd backend",
                    ShowAdException.TICKET_CLAIM_FAILED);
            }
            return body;
        } catch (HttpStatusCodeException ex) {
            throw mapClaimError(ex);
        } catch (RestClientException ex) {
            throw new ShowAdException(
                "Failed to claim redirect ticket: " + ex.getMessage(),
                ShowAdException.NETWORK_ERROR, ex);
        }
    }

    @Override
    public ValidateTokenResponse validateToken(String token) {
        requireConfig("creatorHash", properties.getCreatorHash());
        requireConfig("apiKey", properties.getApiKey());

        String url = stripTrailingSlash(properties.getApiBaseUrl()) + "/api/sdk/validate";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-ShowAd-API-Key", properties.getApiKey());
        headers.set("X-ShowAd-Creator-Hash", properties.getCreatorHash());

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(
            Map.of("token", token, "sdk_key", properties.getApiKey()), headers);

        try {
            ResponseEntity<ValidateTokenResponse> response = restTemplate.exchange(
                url, HttpMethod.POST, entity, ValidateTokenResponse.class);
            ValidateTokenResponse body = response.getBody();
            if (body == null) {
                throw new ShowAdException(
                    "Invalid token validation response from ShowAd backend",
                    ShowAdException.TOKEN_INVALID);
            }
            if (!body.isValid()) {
                throw new ShowAdException(
                    body.getMessage() == null ? "Token is invalid" : body.getMessage(),
                    ShowAdException.TOKEN_INVALID);
            }
            return body;
        } catch (HttpStatusCodeException ex) {
            throw new ShowAdException(
                "Failed to validate token: HTTP " + ex.getStatusCode().value(),
                ShowAdException.TOKEN_INVALID, ex);
        } catch (RestClientException ex) {
            throw new ShowAdException(
                "Failed to validate token: " + ex.getMessage(),
                ShowAdException.NETWORK_ERROR, ex);
        }
    }

    private static ShowAdException mapClaimError(HttpStatusCodeException ex) {
        HttpStatus status = HttpStatus.resolve(ex.getStatusCode().value());
        if (status == null) {
            return new ShowAdException(
                "Failed to claim redirect ticket: HTTP " + ex.getStatusCode().value(),
                ShowAdException.TICKET_CLAIM_FAILED, ex);
        }
        return switch (status) {
            case GONE -> new ShowAdException(
                "Redirect ticket not found or already consumed",
                ShowAdException.TICKET_NOT_FOUND, ex);
            case UNAUTHORIZED -> new ShowAdException(
                "Invalid redirect ticket secret",
                ShowAdException.TICKET_CLAIM_FAILED, ex);
            case FORBIDDEN -> new ShowAdException(
                "Creator hash does not match ticket",
                ShowAdException.CREATOR_MISMATCH, ex);
            default -> new ShowAdException(
                "Failed to claim redirect ticket: HTTP " + status.value(),
                ShowAdException.TICKET_CLAIM_FAILED, ex);
        };
    }

    private static void requireConfig(String name, String value) {
        if (isBlank(value)) {
            throw new ShowAdException(
                "Missing required ShowAd configuration: " + name,
                ShowAdException.CONFIG_ERROR);
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String stripTrailingSlash(String value) {
        if (value == null) {
            return "";
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
