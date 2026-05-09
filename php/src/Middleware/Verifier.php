<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Middleware;

use ProofMark\ShowAd\Config;
use ProofMark\ShowAd\Cookies\CookieJar;
use ProofMark\ShowAd\Jwt\JwtHelper;
use ProofMark\ShowAd\Request\RequestContext;

/**
 * Pure verification logic - no I/O, no globals, no framework coupling.
 *
 * Given a RequestContext and a Config, the verifier reads cookies, decodes
 * the (unsigned) JWT claims, and reports a structured verdict that callers
 * use to decide whether to allow, claim a ticket, or redirect.
 */
final class Verifier
{
    public const REASON_VALID_TOKEN = 'valid_token';
    public const REASON_NO_TOKEN = 'no_token';
    public const REASON_INVALID_TOKEN = 'invalid_token';
    public const REASON_EXPIRED_TOKEN = 'expired_token';
    public const REASON_CREATOR_MISMATCH = 'creator_hash_mismatch';
    public const REASON_FINGERPRINT_MISMATCH = 'fingerprint_mismatch';

    private Config $config;
    private CookieJar $cookieJar;

    public function __construct(Config $config, ?CookieJar $cookieJar = null)
    {
        $this->config = $config;
        $this->cookieJar = $cookieJar ?? new CookieJar($config);
    }

    /**
     * @return array{
     *   verified: bool,
     *   reason: string,
     *   token: ?string,
     *   creator_hash: ?string,
     *   fingerprint: ?string,
     *   expires_at: ?int
     * }
     */
    public function verify(RequestContext $request): array
    {
        $token = $request->cookie($this->cookieJar->name(CookieJar::COOKIE_TOKEN));
        $fingerprint = $request->cookie($this->cookieJar->name(CookieJar::COOKIE_FINGERPRINT));

        if ($token === null || $token === '') {
            return [
                'verified' => false,
                'reason' => self::REASON_NO_TOKEN,
                'token' => null,
                'creator_hash' => null,
                'fingerprint' => $fingerprint,
                'expires_at' => null,
            ];
        }

        $claims = JwtHelper::decodeToken($token);
        if ($claims === null) {
            return [
                'verified' => false,
                'reason' => self::REASON_INVALID_TOKEN,
                'token' => $token,
                'creator_hash' => null,
                'fingerprint' => $fingerprint,
                'expires_at' => null,
            ];
        }

        if (JwtHelper::isTokenExpired($token)) {
            return [
                'verified' => false,
                'reason' => self::REASON_EXPIRED_TOKEN,
                'token' => $token,
                'creator_hash' => isset($claims['creator_hash']) ? (string) $claims['creator_hash'] : null,
                'fingerprint' => $fingerprint,
                'expires_at' => JwtHelper::getTokenExpiry($token),
            ];
        }

        $validation = JwtHelper::validateTokenClaims(
            $token,
            $this->config->creatorHash(),
            $fingerprint
        );

        if (!$validation['valid']) {
            $reason = self::REASON_INVALID_TOKEN;
            if ($validation['reason'] === 'Creator hash mismatch') {
                $reason = self::REASON_CREATOR_MISMATCH;
            } elseif ($validation['reason'] === 'Fingerprint mismatch') {
                $reason = self::REASON_FINGERPRINT_MISMATCH;
            } elseif ($validation['reason'] === 'Token expired') {
                $reason = self::REASON_EXPIRED_TOKEN;
            }

            return [
                'verified' => false,
                'reason' => $reason,
                'token' => $token,
                'creator_hash' => isset($claims['creator_hash']) ? (string) $claims['creator_hash'] : null,
                'fingerprint' => $fingerprint,
                'expires_at' => JwtHelper::getTokenExpiry($token),
            ];
        }

        return [
            'verified' => true,
            'reason' => self::REASON_VALID_TOKEN,
            'token' => $token,
            'creator_hash' => $this->config->creatorHash(),
            'fingerprint' => $fingerprint,
            'expires_at' => JwtHelper::getTokenExpiry($token),
        ];
    }

    public function isVerified(RequestContext $request): bool
    {
        return $this->verify($request)['verified'];
    }
}
