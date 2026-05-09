<?php

namespace ProofMark\ShowAd;

use Illuminate\Http\Request;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;

class ShowAdManager
{
    /**
     * @var array
     */
    protected $config;

    /**
     * @var Client
     */
    protected $httpClient;

    /**
     * Cookie name constants.
     */
    const COOKIE_FINGERPRINT = 'fingerprint';
    const COOKIE_TOKEN = 'token';
    const COOKIE_CREATOR = 'creator';
    const COOKIE_TICKET = 'ticket';
    const COOKIE_VERIFIED = 'verified';
    const COOKIE_EXPIRES = 'expires';
    const COOKIE_META = 'meta';

    /**
     * Create a new ShowAdManager instance.
     *
     * @param array $config
     */
    public function __construct(array $config)
    {
        $this->config = $config;
        $this->httpClient = new Client([
            'timeout' => 10,
            'connect_timeout' => 5,
        ]);
    }

    /**
     * Get a config value.
     *
     * @param string $key
     * @param mixed $default
     * @return mixed
     */
    public function getConfig($key, $default = null)
    {
        return array_get_nested($this->config, $key, $default);
    }

    /**
     * Get the full cookie name with prefix.
     *
     * @param string $suffix
     * @return string
     */
    public function getCookieName($suffix)
    {
        $prefix = $this->getConfig('cookie.prefix', 'showad');
        return "{$prefix}_{$suffix}";
    }

    /**
     * Check if a request has valid ShowAd verification.
     *
     * @param Request $request
     * @return bool
     */
    public function isVerified(Request $request)
    {
        $result = $this->verifyRequest($request);
        return $result['verified'];
    }

    /**
     * Verify a request and return detailed result.
     *
     * @param Request $request
     * @return array
     */
    public function verifyRequest(Request $request)
    {
        $token = $request->cookie($this->getCookieName(self::COOKIE_TOKEN));
        $fingerprint = $request->cookie($this->getCookieName(self::COOKIE_FINGERPRINT));

        if (!$token) {
            return [
                'verified' => false,
                'reason' => 'no_token',
                'token' => null,
                'creator_hash' => null,
            ];
        }

        // Decode and validate token claims
        $claims = JwtHelper::decodeToken($token);

        if (!$claims) {
            return [
                'verified' => false,
                'reason' => 'invalid_token',
                'token' => $token,
                'creator_hash' => null,
            ];
        }

        // Check expiry
        if (JwtHelper::isTokenExpired($token)) {
            return [
                'verified' => false,
                'reason' => 'expired_token',
                'token' => $token,
                'creator_hash' => isset($claims['creator_hash']) ? $claims['creator_hash'] : null,
            ];
        }

        // Validate claims
        $validation = JwtHelper::validateTokenClaims(
            $token,
            $this->getConfig('creator_hash'),
            $fingerprint
        );

        if (!$validation['valid']) {
            return [
                'verified' => false,
                'reason' => $validation['reason'],
                'token' => $token,
                'creator_hash' => isset($claims['creator_hash']) ? $claims['creator_hash'] : null,
            ];
        }

        try {
            $backendValidation = $this->validateToken($token);
        } catch (ShowAdException $e) {
            return [
                'verified' => false,
                'reason' => $e->getCode() === ShowAdException::NETWORK_ERROR
                    ? 'backend_validation_failed'
                    : 'invalid_token',
                'token' => $token,
                'creator_hash' => isset($claims['creator_hash']) ? $claims['creator_hash'] : null,
            ];
        }

        if (empty($backendValidation['valid'])) {
            return [
                'verified' => false,
                'reason' => 'invalid_token',
                'token' => $token,
                'creator_hash' => isset($claims['creator_hash']) ? $claims['creator_hash'] : null,
            ];
        }

        return [
            'verified' => true,
            'reason' => 'valid_token',
            'token' => $token,
            'creator_hash' => $this->getConfig('creator_hash'),
        ];
    }

    /**
     * Claim a redirect ticket from the backend.
     *
     * @param string $ticketId
     * @return array
     * @throws ShowAdException
     */
    public function claimRedirectTicket($ticketId)
    {
        $this->validateRequiredConfig(['creator_hash', 'api_key', 'redirect_secret']);

        $baseUrl = $this->getConfig('api_base_url', 'https://ad.proofmark.io');
        $url = rtrim($baseUrl, '/') . '/api/redirect-ticket/' . urlencode($ticketId) . '/claim';

        $this->debug('Claiming redirect ticket: ' . $ticketId);

        try {
            $response = $this->httpClient->post($url, [
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-Redirect-Ticket-Secret' => $this->getConfig('redirect_secret', ''),
                    'X-ShowAd-API-Key' => $this->getConfig('api_key', ''),
                    'X-ShowAd-Creator-Hash' => $this->getConfig('creator_hash', ''),
                ],
                'json' => [
                    'creator_hash' => $this->getConfig('creator_hash'),
                ],
            ]);

            $data = json_decode($response->getBody()->getContents(), true);

            if (!is_array($data) || empty($data['token']) || empty($data['creator_hash'])) {
                throw new ShowAdException(
                    'Invalid ticket claim response from ShowAd backend',
                    ShowAdException::TICKET_CLAIM_FAILED
                );
            }

            $this->debug('Ticket claimed successfully');

            return $data;
        } catch (GuzzleException $e) {
            $statusCode = method_exists($e, 'getResponse') && $e->getResponse()
                ? $e->getResponse()->getStatusCode()
                : 0;

            switch ($statusCode) {
                case 410:
                    throw new ShowAdException(
                        'Redirect ticket not found or already consumed',
                        ShowAdException::TICKET_NOT_FOUND,
                        $e
                    );
                case 401:
                    throw new ShowAdException(
                        'Invalid redirect ticket secret',
                        ShowAdException::TICKET_CLAIM_FAILED,
                        $e
                    );
                case 403:
                    throw new ShowAdException(
                        'Creator hash does not match ticket',
                        ShowAdException::CREATOR_MISMATCH,
                        $e
                    );
                default:
                    throw new ShowAdException(
                        'Failed to claim redirect ticket: ' . $e->getMessage(),
                        ShowAdException::NETWORK_ERROR,
                        $e
                    );
            }
        }
    }

    /**
     * Validate a token with the backend.
     *
     * @param string $token
     * @return array
     * @throws ShowAdException
     */
    public function validateToken($token)
    {
        $this->validateRequiredConfig(['creator_hash', 'api_key']);

        $baseUrl = $this->getConfig('api_base_url', 'https://ad.proofmark.io');
        $url = rtrim($baseUrl, '/') . '/api/sdk/validate';

        $this->debug('Validating token with backend');

        try {
            $response = $this->httpClient->post($url, [
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-ShowAd-API-Key' => $this->getConfig('api_key', ''),
                    'X-ShowAd-Creator-Hash' => $this->getConfig('creator_hash', ''),
                ],
                'json' => [
                    'token' => $token,
                    'sdk_key' => $this->getConfig('api_key', ''),
                ],
            ]);

            $data = json_decode($response->getBody()->getContents(), true);

            if (!is_array($data)) {
                throw new ShowAdException(
                    'Invalid token validation response from ShowAd backend',
                    ShowAdException::TOKEN_INVALID
                );
            }

            $this->debug('Token validation result: ' . ($data['valid'] ? 'valid' : 'invalid'));

            if (empty($data['valid'])) {
                throw new ShowAdException(
                    isset($data['message']) ? $data['message'] : 'Token is invalid',
                    ShowAdException::TOKEN_INVALID,
                    null,
                    ['response' => $data]
                );
            }

            return $data;
        } catch (GuzzleException $e) {
            throw new ShowAdException(
                'Failed to validate token: ' . $e->getMessage(),
                ShowAdException::NETWORK_ERROR,
                $e
            );
        }
    }

    /**
     * Check backend health.
     *
     * @return bool
     */
    public function checkHealth()
    {
        $baseUrl = $this->getConfig('api_base_url', 'https://ad.proofmark.io');
        $url = rtrim($baseUrl, '/') . '/health';

        try {
            $response = $this->httpClient->get($url, ['timeout' => 5]);
            return $response->getStatusCode() === 200;
        } catch (GuzzleException $e) {
            return false;
        }
    }

    /**
     * Build the video ad redirect URL.
     *
     * @param string|null $returnUrl
     * @return string
     */
    public function buildVideoAdRedirectUrl($returnUrl = null)
    {
        $this->validateRequiredConfig(['creator_hash']);

        $videoAdUrl = rtrim($this->getConfig('video_ad_url', 'https://showad.proofmark.io'), '/');
        $creatorHash = $this->getConfig('creator_hash');

        $url = $videoAdUrl . '/c/' . urlencode($creatorHash);

        $params = ['sdk' => '1'];
        if ($returnUrl) {
            $params['return_url'] = $returnUrl;
        }

        return $url . '?' . http_build_query($params);
    }

    /**
     * Build a resource-specific redirect URL.
     *
     * @param string $projectHash
     * @param string $resourceHash
     * @param string|null $returnUrl
     * @return string
     */
    public function buildResourceRedirectUrl($projectHash, $resourceHash, $returnUrl = null)
    {
        $this->validateRequiredConfig(['creator_hash']);

        $videoAdUrl = rtrim($this->getConfig('video_ad_url', 'https://showad.proofmark.io'), '/');
        $creatorHash = $this->getConfig('creator_hash');

        $url = $videoAdUrl . '/c/' . urlencode($creatorHash)
            . '/' . urlencode($projectHash)
            . '/' . urlencode($resourceHash);

        $params = ['sdk' => '1'];
        if ($returnUrl) {
            $params['return_url'] = $returnUrl;
        }

        return $url . '?' . http_build_query($params);
    }

    /**
     * Get verification state as an array (for Inertia, JSON responses, etc.)
     *
     * @param Request $request
     * @return array
     */
    public function getVerificationState(Request $request)
    {
        $result = $this->verifyRequest($request);
        $token = $request->cookie($this->getCookieName(self::COOKIE_TOKEN));
        $expiresAt = null;
        $fingerprint = $request->cookie($this->getCookieName(self::COOKIE_FINGERPRINT));
        $redirectTicketId = $request->cookie($this->getCookieName(self::COOKIE_TICKET));

        if ($token) {
            $expiresAt = JwtHelper::getTokenExpiry($token);
        }

        return [
            'is_verified' => $result['verified'],
            'is_loading' => false,
            'error' => $result['verified'] ? null : $result['reason'],
            'creator_hash' => $this->getConfig('creator_hash'),
            'fingerprint' => $fingerprint,
            'redirect_ticket_id' => $redirectTicketId,
            'expires_at' => $expiresAt,
            'redirect_url' => $result['verified'] ? null : $this->buildVideoAdRedirectUrl(
                $request->fullUrl()
            ),
        ];
    }

    /**
     * Set verification cookies on a response.
     *
     * @param \Symfony\Component\HttpFoundation\Response $response
     * @param array $data
     * @return \Symfony\Component\HttpFoundation\Response
     */
    public function setVerificationCookies($response, array $data)
    {
        $maxAge = $this->getConfig('cookie.max_age', 3600);
        $secure = $this->getConfig('cookie.secure');
        $sameSite = $this->getConfig('cookie.same_site', 'lax');

        if ($secure === null) {
            $secure = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        }

        // Token cookie (httpOnly for security)
        if (isset($data['token'])) {
            $response->headers->setCookie(
                $this->makeCookie(self::COOKIE_TOKEN, $data['token'], $maxAge, true, $secure, $sameSite)
            );

            // Verified signal cookie (readable by JS)
            $response->headers->setCookie(
                $this->makeCookie(self::COOKIE_VERIFIED, '1', $maxAge, false, $secure, $sameSite)
            );
        }

        // Creator hash cookie
        if (isset($data['creator_hash'])) {
            $response->headers->setCookie(
                $this->makeCookie(self::COOKIE_CREATOR, $data['creator_hash'], $maxAge, false, $secure, $sameSite)
            );
        }

        // Ticket ID cookie
        if (isset($data['ticket_id'])) {
            $response->headers->setCookie(
                $this->makeCookie(self::COOKIE_TICKET, $data['ticket_id'], $maxAge, false, $secure, $sameSite)
            );
        }

        // Expiry cookie
        if (isset($data['token'])) {
            $expiry = JwtHelper::getTokenExpiry($data['token']);
            if ($expiry !== null) {
                $response->headers->setCookie(
                    $this->makeCookie(self::COOKIE_EXPIRES, (string) $expiry, $maxAge, false, $secure, $sameSite)
                );
            }
        }

        return $response;
    }

    /**
     * Clear all verification cookies on a response.
     *
     * @param \Symfony\Component\HttpFoundation\Response $response
     * @return \Symfony\Component\HttpFoundation\Response
     */
    public function clearVerificationCookies($response)
    {
        $secure = $this->getConfig('cookie.secure');
        $sameSite = $this->getConfig('cookie.same_site', 'lax');

        if ($secure === null) {
            $secure = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        }

        $cookies = [
            self::COOKIE_TOKEN,
            self::COOKIE_VERIFIED,
            self::COOKIE_CREATOR,
            self::COOKIE_TICKET,
            self::COOKIE_EXPIRES,
        ];

        foreach ($cookies as $suffix) {
            $response->headers->setCookie(
                $this->makeCookie($suffix, '', -3600, $suffix === self::COOKIE_TOKEN, $secure, $sameSite)
            );
        }

        return $response;
    }

    /**
     * Create a cookie instance.
     *
     * @param string $suffix
     * @param string $value
     * @param int $maxAge
     * @param bool $httpOnly
     * @param bool $secure
     * @param string $sameSite
     * @return \Symfony\Component\HttpFoundation\Cookie
     */
    protected function makeCookie($suffix, $value, $maxAge, $httpOnly, $secure, $sameSite)
    {
        $name = $this->getCookieName($suffix);
        $expiresAt = time() + $maxAge;
        $cookieClass = '\\Symfony\\Component\\HttpFoundation\\Cookie';
        $constructor = new \ReflectionMethod($cookieClass, '__construct');

        if ($constructor->getNumberOfParameters() >= 9) {
            return new $cookieClass(
                $name,
                $value,
                $expiresAt,
                '/',
                null,
                $secure,
                $httpOnly,
                false,
                $sameSite
            );
        }

        return new $cookieClass(
            $name,
            $value,
            $expiresAt,
            '/',
            null,
            $secure,
            $httpOnly,
            false
        );
    }

    /**
     * Render meta tags for the client-side script.
     *
     * @return string
     */
    public function renderMetaTags()
    {
        $creatorHash = e($this->getConfig('creator_hash', ''));
        $apiUrl = e($this->getConfig('api_base_url', 'https://ad.proofmark.io'));
        $videoUrl = e($this->getConfig('video_ad_url', 'https://showad.proofmark.io'));
        $cookiePrefix = e($this->getConfig('cookie.prefix', 'showad'));

        return <<<HTML
<meta name="showad-creator-hash" content="{$creatorHash}">
<meta name="showad-api-url" content="{$apiUrl}">
<meta name="showad-video-url" content="{$videoUrl}">
<meta name="showad-cookie-prefix" content="{$cookiePrefix}">
HTML;
    }

    /**
     * Render the ShowAd client-side JavaScript.
     *
     * @return string
     */
    public function renderScripts()
    {
        $creatorHash = e($this->getConfig('creator_hash', ''));
        $cookiePrefix = e($this->getConfig('cookie.prefix', 'showad'));
        $videoUrl = e($this->getConfig('video_ad_url', 'https://showad.proofmark.io'));
        $debug = $this->isDebug() ? 'true' : 'false';

        return view('showad::scripts', [
            'creatorHash' => $creatorHash,
            'cookiePrefix' => $cookiePrefix,
            'videoUrl' => $videoUrl,
            'debug' => $debug,
        ])->render();
    }

    /**
     * Check if path matches a pattern.
     *
     * @param string $path
     * @param string $pattern
     * @return bool
     */
    public function pathMatches($path, $pattern)
    {
        $path = '/' . ltrim($path, '/');
        $pattern = '/' . ltrim($pattern, '/');

        if ($path === $pattern) {
            return true;
        }

        if (strpos($pattern, '*') !== false) {
            $regex = preg_quote($pattern, '/');
            $regex = str_replace('\\*', '.*', $regex);
            return (bool) preg_match('/^' . $regex . '$/', $path);
        }

        return false;
    }

    /**
     * Check if path matches any of the given patterns.
     *
     * @param string $path
     * @param array $patterns
     * @return bool
     */
    public function pathMatchesAny($path, array $patterns)
    {
        foreach ($patterns as $pattern) {
            if ($this->pathMatches($path, $pattern)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Log a debug message.
     *
     * @param string $message
     * @return void
     */
    public function debug($message)
    {
        if ($this->isDebug()) {
            if (function_exists('logger')) {
                logger('[ShowAd SDK] ' . $message);
            }
        }
    }

    /**
     * Check if debug mode is enabled.
     *
     * @return bool
     */
    protected function isDebug()
    {
        $debug = $this->getConfig('debug');
        if ($debug === null) {
            if (function_exists('config')) {
                return config('app.debug', false);
            }

            return false;
        }
        return (bool) $debug;
    }

    /**
     * Validate required configuration values.
     *
     * @param array $keys
     * @return void
     * @throws ShowAdException
     */
    protected function validateRequiredConfig(array $keys)
    {
        foreach ($keys as $key) {
            $value = $this->getConfig($key);

            if ($value === null || $value === '') {
                throw new ShowAdException(
                    'Missing required ShowAd configuration: ' . $key,
                    ShowAdException::CONFIG_ERROR,
                    null,
                    ['key' => $key]
                );
            }
        }
    }
}

/**
 * Helper to get nested array values using dot notation.
 * Compatible with PHP 7.1+.
 *
 * @param array $array
 * @param string $key
 * @param mixed $default
 * @return mixed
 */
function array_get_nested(array $array, $key, $default = null)
{
    if (isset($array[$key])) {
        return $array[$key];
    }

    foreach (explode('.', $key) as $segment) {
        if (!is_array($array) || !array_key_exists($segment, $array)) {
            return $default;
        }
        $array = $array[$segment];
    }

    return $array;
}
