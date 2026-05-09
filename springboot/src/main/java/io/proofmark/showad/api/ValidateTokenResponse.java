package io.proofmark.showad.api;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Response payload returned by {@code POST /api/sdk/validate}.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class ValidateTokenResponse {

    private boolean valid;
    private String message;

    @JsonProperty("creator_hash")
    private String creatorHash;

    public boolean isValid() { return valid; }
    public void setValid(boolean valid) { this.valid = valid; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public String getCreatorHash() { return creatorHash; }
    public void setCreatorHash(String creatorHash) { this.creatorHash = creatorHash; }
}
