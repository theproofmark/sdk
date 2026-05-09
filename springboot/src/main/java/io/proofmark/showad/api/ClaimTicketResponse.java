package io.proofmark.showad.api;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Response payload returned by {@code POST /api/redirect-ticket/{id}/claim}.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class ClaimTicketResponse {

    private String token;

    @JsonProperty("creator_hash")
    private String creatorHash;

    @JsonProperty("ticket_id")
    private String ticketId;

    @JsonProperty("expires_at")
    private Long expiresAt;

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public String getCreatorHash() { return creatorHash; }
    public void setCreatorHash(String creatorHash) { this.creatorHash = creatorHash; }
    public String getTicketId() { return ticketId; }
    public void setTicketId(String ticketId) { this.ticketId = ticketId; }
    public Long getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Long expiresAt) { this.expiresAt = expiresAt; }
}
