package showad

import (
	"net"
	"net/http"
	"strings"
)

// AccessAction is the outcome of a policy decision.
type AccessAction string

const (
	ActionAllow    AccessAction = "allow"
	ActionContinue AccessAction = "continue"
	ActionRedirect AccessAction = "redirect"
)

// CrawlerFamily identifies a recognised crawler family.
type CrawlerFamily string

// Default crawler UA fragments per family. UA detection alone never bypasses
// access control; it only narrows which IP/rDNS rules to apply.
var DefaultCrawlerUserAgents = map[CrawlerFamily][]string{
	"google":      {"googlebot", "google-inspectiontool", "apis-google"},
	"bing":        {"bingbot"},
	"duckduckgo":  {"duckduckbot"},
	"yandex":      {"yandexbot"},
	"baidu":       {"baiduspider"},
	"openai":      {"gptbot", "chatgpt-user", "oai-searchbot"},
	"anthropic":   {"claudebot", "anthropic-ai"},
	"perplexity":  {"perplexitybot"},
	"commoncrawl": {"ccbot"},
	"facebook":    {"facebookexternalhit", "facebot"},
	"twitter":     {"twitterbot"},
	"linkedin":    {"linkedinbot"},
}

// CrawlerPolicy configures verified-crawler bypass.
type CrawlerPolicy struct {
	Enabled                 bool
	Families                []CrawlerFamily
	UserAgents              map[CrawlerFamily][]string
	FamilyCIDRs             map[CrawlerFamily][]string
	AllowCloudflareVerified bool
	ReverseDNSVerifier      func(ip string, family CrawlerFamily) bool
}

// AccessPolicy configures pre-verification gating.
type AccessPolicy struct {
	TrustedIPHeaders []string
	AllowCIDRs       []string
	Crawler          *CrawlerPolicy
	BeforeProtect    func(r *http.Request, ctx AccessContext) AccessDecision
}

// AccessContext is passed to BeforeProtect.
type AccessContext struct {
	ClientIP  string
	UserAgent string
	Pathname  string
}

// AccessDecision is the structured policy outcome.
type AccessDecision struct {
	Action      AccessAction
	Reason      string
	RedirectURL string
}

// CrawlerVerification result.
type CrawlerVerification struct {
	Verified bool
	Family   CrawlerFamily
	Reason   string
}

// EvaluateAccessPolicy runs the crawler/CIDR/before_protect pipeline.
func EvaluateAccessPolicy(r *http.Request, p AccessPolicy) AccessDecision {
	clientIP := GetClientIP(r, p.TrustedIPHeaders)
	ua := r.Header.Get("User-Agent")

	if p.Crawler != nil {
		v := VerifyCrawler(clientIP, ua, r, p.Crawler)
		if v.Verified {
			return AccessDecision{Action: ActionAllow, Reason: "crawler:" + string(v.Family)}
		}
	}

	if clientIP != "" && IsIPInCIDRs(clientIP, p.AllowCIDRs) {
		return AccessDecision{Action: ActionAllow, Reason: "cidr_allowlist"}
	}

	if p.BeforeProtect != nil {
		ctx := AccessContext{ClientIP: clientIP, UserAgent: ua, Pathname: r.URL.Path}
		d := p.BeforeProtect(r, ctx)
		if d.Action == "" {
			d.Action = ActionContinue
		}
		return d
	}

	return AccessDecision{Action: ActionContinue}
}

// VerifyCrawler combines a UA family match with a trusted-IP or rDNS proof.
func VerifyCrawler(ip, userAgent string, r *http.Request, policy *CrawlerPolicy) CrawlerVerification {
	if policy == nil || !policy.Enabled {
		return CrawlerVerification{Reason: "disabled"}
	}

	uaMap := policy.UserAgents
	if uaMap == nil {
		uaMap = DefaultCrawlerUserAgents
	}
	families := policy.Families
	if len(families) == 0 {
		families = make([]CrawlerFamily, 0, len(uaMap))
		for f := range uaMap {
			families = append(families, f)
		}
	}

	family := matchCrawlerFamily(userAgent, families, uaMap)
	if family == "" {
		return CrawlerVerification{Reason: "no_family_match"}
	}
	if ip == "" {
		return CrawlerVerification{Family: family, Reason: "missing_ip"}
	}

	if policy.AllowCloudflareVerified && r != nil {
		v := r.Header.Get("CF-Verified-Bot")
		if v == "" {
			v = r.Header.Get("X-ProofMark-CF-Verified-Bot")
		}
		if isTruthy(v) {
			return CrawlerVerification{Verified: true, Family: family, Reason: "cloudflare_verified_bot"}
		}
	}

	if IsIPInCIDRs(ip, policy.FamilyCIDRs[family]) {
		return CrawlerVerification{Verified: true, Family: family, Reason: "cidr_match"}
	}

	if policy.ReverseDNSVerifier != nil && policy.ReverseDNSVerifier(ip, family) {
		return CrawlerVerification{Verified: true, Family: family, Reason: "reverse_dns_match"}
	}

	return CrawlerVerification{Family: family, Reason: "ip_not_verified"}
}

// IsIPInCIDRs returns true if ip falls inside any of the CIDR ranges.
// A bare IP (no '/') is treated as an exact match.
func IsIPInCIDRs(ip string, cidrs []string) bool {
	if ip == "" || len(cidrs) == 0 {
		return false
	}
	parsed := net.ParseIP(strings.TrimSpace(ip))
	if parsed == nil {
		return false
	}
	for _, c := range cidrs {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if !strings.Contains(c, "/") {
			if other := net.ParseIP(c); other != nil && other.Equal(parsed) {
				return true
			}
			continue
		}
		_, network, err := net.ParseCIDR(c)
		if err != nil {
			continue
		}
		if network.Contains(parsed) {
			return true
		}
	}
	return false
}

// GetClientIP returns the client IP from the first non-empty trusted header,
// falling back to r.RemoteAddr.
func GetClientIP(r *http.Request, trustedHeaders []string) string {
	if r == nil {
		return ""
	}
	for _, h := range trustedHeaders {
		if v := r.Header.Get(h); v != "" {
			if first := strings.TrimSpace(strings.SplitN(v, ",", 2)[0]); first != "" {
				return first
			}
		}
	}
	if r.RemoteAddr == "" {
		return ""
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func matchCrawlerFamily(ua string, families []CrawlerFamily, uaMap map[CrawlerFamily][]string) CrawlerFamily {
	if ua == "" {
		return ""
	}
	needle := strings.ToLower(ua)
	for _, f := range families {
		for _, frag := range uaMap[f] {
			if frag == "" {
				continue
			}
			if strings.Contains(needle, strings.ToLower(frag)) {
				return f
			}
		}
	}
	return ""
}

func isTruthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
