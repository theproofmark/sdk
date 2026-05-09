package io.proofmark.showad.error;

import java.util.Collections;
import java.util.Map;

/**
 * Exception thrown by the ShowAd SDK when verification or backend communication fails.
 *
 * Mirrors the error code namespace used by the Laravel and Next.js SDKs so that
 * callers can branch on identical conditions across stacks.
 */
public class ShowAdException extends RuntimeException {

    public static final int FINGERPRINT_FAILED = 1001;
    public static final int TICKET_NOT_FOUND = 1002;
    public static final int TICKET_EXPIRED = 1003;
    public static final int TICKET_CLAIM_FAILED = 1004;
    public static final int TOKEN_INVALID = 1005;
    public static final int TOKEN_EXPIRED = 1006;
    public static final int CREATOR_MISMATCH = 1007;
    public static final int NETWORK_ERROR = 1008;
    public static final int CONFIG_ERROR = 1009;

    private final int errorCode;
    private final Map<String, Object> details;

    public ShowAdException(String message, int errorCode) {
        this(message, errorCode, null, Collections.emptyMap());
    }

    public ShowAdException(String message, int errorCode, Throwable cause) {
        this(message, errorCode, cause, Collections.emptyMap());
    }

    public ShowAdException(String message, int errorCode, Throwable cause, Map<String, Object> details) {
        super(message, cause);
        this.errorCode = errorCode;
        this.details = details == null ? Collections.emptyMap() : Map.copyOf(details);
    }

    public int getErrorCode() {
        return errorCode;
    }

    public Map<String, Object> getDetails() {
        return details;
    }

    public String getErrorName() {
        return switch (errorCode) {
            case FINGERPRINT_FAILED -> "FINGERPRINT_FAILED";
            case TICKET_NOT_FOUND -> "TICKET_NOT_FOUND";
            case TICKET_EXPIRED -> "TICKET_EXPIRED";
            case TICKET_CLAIM_FAILED -> "TICKET_CLAIM_FAILED";
            case TOKEN_INVALID -> "TOKEN_INVALID";
            case TOKEN_EXPIRED -> "TOKEN_EXPIRED";
            case CREATOR_MISMATCH -> "CREATOR_MISMATCH";
            case NETWORK_ERROR -> "NETWORK_ERROR";
            case CONFIG_ERROR -> "CONFIG_ERROR";
            default -> "UNKNOWN_ERROR";
        };
    }
}
