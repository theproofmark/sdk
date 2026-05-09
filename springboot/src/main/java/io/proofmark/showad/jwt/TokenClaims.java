package io.proofmark.showad.jwt;

import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * JWT payload as produced by the ProofMark backend.
 *
 * Only the fields used by the SDK are typed; everything else is captured in
 * {@link #extras} so callers can read additional claims if needed.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class TokenClaims {

    private String iss;
    private String sub;
    @JsonProperty("creator_hash")
    private String creatorHash;
    private String fingerprint;
    @JsonProperty("session_hash")
    private String sessionHash;
    private Long exp;
    private Long nbf;
    private Long iat;
    private Map<String, Object> extras;

    public String getIss() { return iss; }
    public void setIss(String iss) { this.iss = iss; }
    public String getSub() { return sub; }
    public void setSub(String sub) { this.sub = sub; }
    public String getCreatorHash() { return creatorHash; }
    public void setCreatorHash(String creatorHash) { this.creatorHash = creatorHash; }
    public String getFingerprint() { return fingerprint; }
    public void setFingerprint(String fingerprint) { this.fingerprint = fingerprint; }
    public String getSessionHash() { return sessionHash; }
    public void setSessionHash(String sessionHash) { this.sessionHash = sessionHash; }
    public Long getExp() { return exp; }
    public void setExp(Long exp) { this.exp = exp; }
    public Long getNbf() { return nbf; }
    public void setNbf(Long nbf) { this.nbf = nbf; }
    public Long getIat() { return iat; }
    public void setIat(Long iat) { this.iat = iat; }
    public Map<String, Object> getExtras() { return extras; }
    public void setExtras(Map<String, Object> extras) { this.extras = extras; }
}
