<?php
/**
 * Server-only access policy that runs before ShowAd verification.
 *
 * Pipeline:
 *   1. Verified crawler (UA family + trusted IP range OR Cloudflare verified bot)
 *   2. CIDR allowlist resolved from a trusted IP header
 *   3. Optional WordPress filter `showad_access_policy_decision` for publisher
 *      logic (premium users, app sessions, ...) -- must run server-side
 *
 * @package ShowAd
 */

namespace ShowAd;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class AccessPolicy {

    /**
     * @var array<string, string[]>
     */
    public const DEFAULT_CRAWLER_USER_AGENTS = array(
        'google'      => array( 'googlebot', 'google-inspectiontool', 'apis-google' ),
        'bing'        => array( 'bingbot' ),
        'duckduckgo'  => array( 'duckduckbot' ),
        'yandex'      => array( 'yandexbot' ),
        'baidu'       => array( 'baiduspider' ),
        'openai'      => array( 'gptbot', 'chatgpt-user', 'oai-searchbot' ),
        'anthropic'   => array( 'claudebot', 'anthropic-ai' ),
        'perplexity'  => array( 'perplexitybot' ),
        'commoncrawl' => array( 'ccbot' ),
        'facebook'    => array( 'facebookexternalhit', 'facebot' ),
        'twitter'     => array( 'twitterbot' ),
        'linkedin'    => array( 'linkedinbot' ),
    );

    /**
     * Evaluate the policy. Returns one of:
     *   array( 'action' => 'continue' )
     *   array( 'action' => 'allow', 'reason' => '...' )
     *   array( 'action' => 'redirect', 'reason' => '...', 'redirect_url' => '...' )
     *
     * @param array $config Access policy configuration.
     * @return array
     */
    public function evaluate( array $config ) {
        $client_ip  = $this->resolve_client_ip( $config['trusted_ip_headers'] ?? array() );
        $user_agent = isset( $_SERVER['HTTP_USER_AGENT'] )
            ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) )
            : '';

        $crawler = $this->verify_crawler( $client_ip, $user_agent, $config['crawler'] ?? array() );
        if ( ! empty( $crawler['verified'] ) ) {
            return array(
                'action' => 'allow',
                'reason' => 'crawler:' . ( $crawler['family'] ?? 'unknown' ),
            );
        }

        if ( $client_ip && $this->ip_in_cidrs( $client_ip, $config['allow_cidrs'] ?? array() ) ) {
            return array( 'action' => 'allow', 'reason' => 'cidr_allowlist' );
        }

        /**
         * Filter: showad_access_policy_decision
         *
         * Allow plugins/themes to provide an authoritative server-side decision
         * (e.g. premium membership lookup). Return any of:
         *   - 'continue' / 'allow' / 'redirect'
         *   - array( 'action' => '...', 'reason' => '...', 'redirect_url' => '...' )
         */
        $decision = apply_filters(
            'showad_access_policy_decision',
            array( 'action' => 'continue' ),
            array(
                'client_ip'  => $client_ip,
                'user_agent' => $user_agent,
            )
        );

        return $this->normalise_decision( $decision );
    }

    /**
     * Resolve the client IP from a trusted edge header, falling back to
     * REMOTE_ADDR. Trusted headers must be configured by the publisher so
     * this isn't spoofable from arbitrary hops.
     *
     * @param string[] $trusted_ip_headers
     * @return string|null
     */
    public function resolve_client_ip( array $trusted_ip_headers ) {
        foreach ( $trusted_ip_headers as $header ) {
            $key = 'HTTP_' . strtoupper( str_replace( '-', '_', $header ) );
            if ( empty( $_SERVER[ $key ] ) ) {
                continue;
            }
            $value = sanitize_text_field( wp_unslash( $_SERVER[ $key ] ) );
            $first = trim( explode( ',', $value )[0] );
            if ( $first !== '' ) {
                return $first;
            }
        }

        return isset( $_SERVER['REMOTE_ADDR'] )
            ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) )
            : null;
    }

    /**
     * @return array{verified: bool, reason: string, family?: string}
     */
    public function verify_crawler( $ip, $user_agent, array $crawler_config ) {
        if ( empty( $crawler_config['enabled'] ) ) {
            return array( 'verified' => false, 'reason' => 'disabled' );
        }

        $families  = $crawler_config['families'] ?? array_keys( self::DEFAULT_CRAWLER_USER_AGENTS );
        $ua_map    = $crawler_config['user_agents'] ?? self::DEFAULT_CRAWLER_USER_AGENTS;
        $family    = $this->match_crawler_family( $user_agent, $families, $ua_map );

        if ( null === $family ) {
            return array( 'verified' => false, 'reason' => 'no_family_match' );
        }

        if ( empty( $ip ) ) {
            return array( 'verified' => false, 'reason' => 'missing_ip', 'family' => $family );
        }

        if ( ! empty( $crawler_config['allow_cloudflare_verified_bot'] ) ) {
            $verified_bot = $_SERVER['HTTP_CF_VERIFIED_BOT']
                ?? $_SERVER['HTTP_X_PROOFMARK_CF_VERIFIED_BOT']
                ?? null;
            if ( $verified_bot && in_array( strtolower( (string) $verified_bot ), array( '1', 'true', 'yes', 'on' ), true ) ) {
                return array( 'verified' => true, 'reason' => 'cloudflare_verified_bot', 'family' => $family );
            }
        }

        $cidrs = $crawler_config['family_cidrs'][ $family ] ?? array();
        if ( $this->ip_in_cidrs( $ip, $cidrs ) ) {
            return array( 'verified' => true, 'reason' => 'cidr_match', 'family' => $family );
        }

        $verifier = $crawler_config['reverse_dns_verifier'] ?? null;
        if ( is_callable( $verifier ) && call_user_func( $verifier, $ip, $family ) ) {
            return array( 'verified' => true, 'reason' => 'reverse_dns_match', 'family' => $family );
        }

        return array( 'verified' => false, 'reason' => 'ip_not_verified', 'family' => $family );
    }

    public function ip_in_cidrs( $ip, array $cidrs ) {
        foreach ( $cidrs as $cidr ) {
            if ( $this->ip_matches_cidr( $ip, $cidr ) ) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param string[] $families
     * @param array<string, string[]> $ua_map
     */
    protected function match_crawler_family( $user_agent, array $families, array $ua_map ) {
        $needle = strtolower( (string) $user_agent );
        if ( '' === $needle ) {
            return null;
        }

        foreach ( $families as $family ) {
            foreach ( ( $ua_map[ $family ] ?? array() ) as $fragment ) {
                if ( $fragment !== '' && false !== strpos( $needle, strtolower( $fragment ) ) ) {
                    return $family;
                }
            }
        }

        return null;
    }

    protected function normalise_decision( $decision ) {
        if ( is_string( $decision ) ) {
            return array( 'action' => $decision );
        }

        if ( is_array( $decision ) && isset( $decision['action'] ) ) {
            return $decision;
        }

        return array( 'action' => 'continue' );
    }

    protected function ip_matches_cidr( $ip, $cidr ) {
        if ( false === strpos( $cidr, '/' ) ) {
            return @inet_pton( $ip ) === @inet_pton( $cidr );
        }

        list( $range, $bits ) = explode( '/', $cidr, 2 );
        if ( ! is_numeric( $bits ) ) {
            return false;
        }

        $range_bin = @inet_pton( $range );
        $ip_bin    = @inet_pton( $ip );
        if ( false === $range_bin || false === $ip_bin || strlen( $range_bin ) !== strlen( $ip_bin ) ) {
            return false;
        }

        $bits     = (int) $bits;
        $max_bits = strlen( $ip_bin ) * 8;
        if ( $bits < 0 || $bits > $max_bits ) {
            return false;
        }

        $bytes     = intdiv( $bits, 8 );
        $remainder = $bits % 8;

        if ( $bytes > 0 && substr( $range_bin, 0, $bytes ) !== substr( $ip_bin, 0, $bytes ) ) {
            return false;
        }

        if ( 0 === $remainder ) {
            return true;
        }

        $mask = chr( ( 0xFF << ( 8 - $remainder ) ) & 0xFF );
        return ( substr( $range_bin, $bytes, 1 ) & $mask ) === ( substr( $ip_bin, $bytes, 1 ) & $mask );
    }
}
