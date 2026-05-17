<?php
/**
 * Core ShowAd manager — business logic layer.
 *
 * Handles verification, ticket claiming, token validation,
 * cookie management, and backend communication.
 *
 * @package ShowAd
 */

namespace ShowAd;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Manager {

    // Cookie name suffixes.
    const COOKIE_FINGERPRINT = 'fingerprint';
    const COOKIE_TOKEN       = 'token';
    const COOKIE_CREATOR     = 'creator';
    const COOKIE_TICKET      = 'ticket';
    const COOKIE_VERIFIED    = 'verified';
    const COOKIE_EXPIRES     = 'expires';
    const COOKIE_META        = 'meta';

    /**
     * Plugin settings.
     *
     * @var array
     */
    private $settings;

    /**
     * Constructor.
     */
    public function __construct() {
        $this->settings = $this->load_settings();
    }

    /**
     * Load and merge settings with defaults.
     *
     * @return array
     */
    private function load_settings() {
        $saved    = get_option( 'showad_settings', array() );
        $defaults = showad_get_default_settings();
        return wp_parse_args( $saved, $defaults );
    }

    /**
     * Get all settings.
     *
     * @return array
     */
    public function get_settings() {
        return $this->settings;
    }

    /**
     * Get a single setting value.
     *
     * @param string $key     Setting key.
     * @param mixed  $default Default value.
     * @return mixed
     */
    public function get_setting( $key, $default = null ) {
        return isset( $this->settings[ $key ] ) ? $this->settings[ $key ] : $default;
    }

    /**
     * Get the full cookie name with prefix.
     *
     * @param string $suffix Cookie name suffix.
     * @return string
     */
    public function cookie_name( $suffix ) {
        return $this->settings['cookie_prefix'] . '_' . $suffix;
    }

    /**
     * Check if the current request is verified.
     *
     * @return bool
     */
    public function is_verified() {
        $result = $this->verify_request();
        return $result['verified'];
    }

    /**
     * Full verification of the current request.
     *
     * @return array {
     *     @type bool        $verified     Whether verification passed.
     *     @type string      $reason       Reason code.
     *     @type string|null $token        JWT token if present.
     *     @type string|null $creator_hash Creator hash from token.
     * }
     */
    public function verify_request() {
        $token_cookie = $this->cookie_name( self::COOKIE_TOKEN );
        $fp_cookie    = $this->cookie_name( self::COOKIE_FINGERPRINT );

        // Check for existing token.
        if ( empty( $_COOKIE[ $token_cookie ] ) ) {
            return array(
                'verified'     => false,
                'reason'       => 'no_token',
                'token'        => null,
                'creator_hash' => null,
            );
        }

        $token       = sanitize_text_field( wp_unslash( $_COOKIE[ $token_cookie ] ) );
        $fingerprint = isset( $_COOKIE[ $fp_cookie ] ) ? sanitize_text_field( wp_unslash( $_COOKIE[ $fp_cookie ] ) ) : null;

        // Decode and validate token.
        $claims = JwtHelper::decode_token( $token );
        if ( null === $claims ) {
            return array(
                'verified'     => false,
                'reason'       => 'invalid_token',
                'token'        => $token,
                'creator_hash' => null,
            );
        }

        // Check expiry.
        if ( JwtHelper::is_token_expired( $token ) ) {
            return array(
                'verified'     => false,
                'reason'       => 'expired_token',
                'token'        => $token,
                'creator_hash' => isset( $claims['creator_hash'] ) ? $claims['creator_hash'] : null,
            );
        }

        // Validate creator hash.
        $expected_creator = $this->settings['creator_hash'];
        $token_creator    = isset( $claims['creator_hash'] ) ? $claims['creator_hash'] : '';

        if ( ! empty( $expected_creator ) && $token_creator !== $expected_creator ) {
            return array(
                'verified'     => false,
                'reason'       => 'creator_mismatch',
                'token'        => $token,
                'creator_hash' => $token_creator,
            );
        }

        // Validate fingerprint if available.
        $token_fingerprint = isset( $claims['fingerprint'] ) ? $claims['fingerprint'] : '';
        if ( ! empty( $fingerprint ) && ! empty( $token_fingerprint ) && $fingerprint !== $token_fingerprint ) {
            return array(
                'verified'     => false,
                'reason'       => 'fingerprint_mismatch',
                'token'        => $token,
                'creator_hash' => $token_creator,
            );
        }

        try {
            $remote_validation = $this->validate_token_remote( $token );
        } catch ( ShowAdException $e ) {
            return array(
                'verified'     => false,
                'reason'       => ShowAdException::NETWORK_ERROR === $e->getCode() ? 'backend_validation_failed' : 'invalid_token',
                'token'        => $token,
                'creator_hash' => $token_creator,
            );
        }

        if ( empty( $remote_validation['valid'] ) ) {
            return array(
                'verified'     => false,
                'reason'       => 'invalid_token',
                'token'        => $token,
                'creator_hash' => $token_creator,
            );
        }

        return array(
            'verified'     => true,
            'reason'       => 'valid_token',
            'token'        => $token,
            'creator_hash' => $token_creator,
        );
    }

    /**
     * Get the verification state as an associative array (for templates/JS).
     *
     * @return array
     */
    public function get_verification_state() {
        $result  = $this->verify_request();
        $expires = null;

        if ( $result['verified'] && ! empty( $result['token'] ) ) {
            $expires = JwtHelper::get_token_expiry( $result['token'] );
        }

        return array(
            'is_verified'  => $result['verified'],
            'reason'       => $result['reason'],
            'creator_hash' => $result['creator_hash'],
            'expires_at'   => $expires,
            'redirect_url' => $this->build_video_ad_redirect_url(),
        );
    }

    /**
     * Claim a redirect ticket from the backend.
     *
     * @param string $ticket_id Redirect ticket ID.
     * @return array Claim response data.
     * @throws ShowAdException On API errors.
     */
    public function claim_redirect_ticket( $ticket_id ) {
        $ticket_id = sanitize_text_field( $ticket_id );

        if ( empty( $ticket_id ) ) {
            throw new ShowAdException(
                __( 'Ticket ID is required.', 'showad-content-gate' ),
                ShowAdException::TICKET_NOT_FOUND
            );
        }

        $api_url = trailingslashit( $this->settings['api_base_url'] ) . 'api/redirect-ticket/' . rawurlencode( $ticket_id ) . '/claim';

        $response = wp_remote_post( $api_url, array(
            'timeout' => 15,
            'headers' => array(
                'Content-Type'             => 'application/json',
                'X-Redirect-Ticket-Secret' => $this->settings['redirect_secret'],
                'X-ShowAd-API-Key'         => $this->settings['api_key'],
                'X-ShowAd-Creator-Hash'    => $this->settings['creator_hash'],
            ),
            'body'    => wp_json_encode( array(
                'creator_hash' => $this->settings['creator_hash'],
            ) ),
        ) );

        if ( is_wp_error( $response ) ) {
            throw new ShowAdException(
                $response->get_error_message(),
                ShowAdException::NETWORK_ERROR
            );
        }

        $code = wp_remote_retrieve_response_code( $response );
        $body = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( 410 === $code ) {
            throw new ShowAdException(
                __( 'Redirect ticket not found or already consumed.', 'showad-content-gate' ),
                ShowAdException::TICKET_NOT_FOUND
            );
        }

        if ( 401 === $code ) {
            throw new ShowAdException(
                __( 'Invalid redirect secret.', 'showad-content-gate' ),
                ShowAdException::TICKET_CLAIM_FAILED
            );
        }

        if ( 403 === $code ) {
            throw new ShowAdException(
                __( 'Creator hash mismatch.', 'showad-content-gate' ),
                ShowAdException::CREATOR_MISMATCH
            );
        }

        if ( $code < 200 || $code >= 300 ) {
            $msg = isset( $body['message'] ) ? $body['message'] : __( 'Failed to claim ticket.', 'showad-content-gate' );
            throw new ShowAdException( $msg, ShowAdException::TICKET_CLAIM_FAILED );
        }

        return $body;
    }

    /**
     * Validate a token against the backend.
     *
     * @param string $token JWT token.
     * @return array Validation result.
     * @throws ShowAdException On API errors.
     */
    public function validate_token_remote( $token ) {
        $api_url = trailingslashit( $this->settings['api_base_url'] ) . 'api/sdk/validate';

        $response = wp_remote_post( $api_url, array(
            'timeout' => 15,
            'headers' => array(
                'Content-Type'          => 'application/json',
                'X-ShowAd-API-Key'      => $this->settings['api_key'],
                'X-ShowAd-Creator-Hash' => $this->settings['creator_hash'],
            ),
            'body'    => wp_json_encode( array(
                'token'   => $token,
                'sdk_key' => $this->settings['api_key'],
            ) ),
        ) );

        if ( is_wp_error( $response ) ) {
            throw new ShowAdException(
                $response->get_error_message(),
                ShowAdException::NETWORK_ERROR
            );
        }

        $code = wp_remote_retrieve_response_code( $response );
        $body = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $code < 200 || $code >= 300 ) {
            $message = is_array( $body ) && isset( $body['message'] ) ? $body['message'] : __( 'Token validation failed.', 'showad-content-gate' );
            throw new ShowAdException(
                $message,
                ShowAdException::TOKEN_INVALID
            );
        }

        if ( ! is_array( $body ) ) {
            throw new ShowAdException(
                __( 'Invalid token validation response from ShowAd backend.', 'showad-content-gate' ),
                ShowAdException::TOKEN_INVALID
            );
        }

        if ( empty( $body['valid'] ) ) {
            throw new ShowAdException(
                isset( $body['message'] ) ? $body['message'] : __( 'Token is invalid.', 'showad-content-gate' ),
                ShowAdException::TOKEN_INVALID
            );
        }

        return $body;
    }

    /**
     * Check if the ShowAd backend is reachable.
     *
     * @return array Health check result.
     */
    public function check_backend_health() {
        $cached = get_transient( 'showad_health_check' );
        if ( false !== $cached ) {
            return $cached;
        }

        $api_url  = trailingslashit( $this->settings['api_base_url'] ) . 'health';
        $response = wp_remote_get( $api_url, array( 'timeout' => 10 ) );

        if ( is_wp_error( $response ) ) {
            $result = array(
                'healthy' => false,
                'message' => $response->get_error_message(),
            );
        } else {
            $code   = wp_remote_retrieve_response_code( $response );
            $result = array(
                'healthy' => 200 === $code,
                'message' => 200 === $code ? 'OK' : 'Backend returned HTTP ' . $code,
            );
        }

        set_transient( 'showad_health_check', $result, 60 );
        return $result;
    }

    /**
     * Build the URL to redirect users to the video ad.
     *
     * @param string|null $return_url URL to return to after watching ad.
     * @return string
     */
    public function build_video_ad_redirect_url( $return_url = null ) {
        if ( null === $return_url ) {
            $return_url = $this->get_current_url();
        }

        $base_url = trailingslashit( $this->settings['video_ad_url'] ) . 'c/' . rawurlencode( $this->settings['creator_hash'] );

        return add_query_arg( array(
            'sdk'        => '1',
            'return_url' => rawurlencode( $return_url ),
        ), $base_url );
    }

    /**
     * Get the current page URL.
     *
     * @return string
     */
    public function get_current_url() {
        $scheme = is_ssl() ? 'https' : 'http';
        return $scheme . '://' . sanitize_text_field( wp_unslash( $_SERVER['HTTP_HOST'] ?? '' ) ) . sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ?? '' ) );
    }

    /**
     * Set verification cookies on the response.
     *
     * @param array $data {
     *     Cookie data.
     *     @type string $token        JWT token.
     *     @type string $ticket_id    Redirect ticket ID.
     *     @type string $creator_hash Creator hash.
     * }
     */
    public function set_verification_cookies( $data ) {
        $max_age  = intval( $this->settings['cookie_max_age'] );
        $expires  = time() + $max_age;
        $secure   = $this->is_cookie_secure();
        $samesite = $this->settings['cookie_samesite'];
        $path     = '/';

        $cookie_options = array(
            'expires'  => $expires,
            'path'     => $path,
            'secure'   => $secure,
            'httponly' => false,
            'samesite' => $samesite,
        );

        // Token cookie — httpOnly for security.
        if ( ! empty( $data['token'] ) ) {
            $token_options             = $cookie_options;
            $token_options['httponly'] = true;
            $this->set_cookie( $this->cookie_name( self::COOKIE_TOKEN ), $data['token'], $token_options );
        }

        // Verified signal cookie — readable by JS.
        $this->set_cookie( $this->cookie_name( self::COOKIE_VERIFIED ), '1', $cookie_options );

        // Creator hash.
        if ( ! empty( $data['creator_hash'] ) ) {
            $this->set_cookie( $this->cookie_name( self::COOKIE_CREATOR ), $data['creator_hash'], $cookie_options );
        }

        // Ticket ID.
        if ( ! empty( $data['ticket_id'] ) ) {
            $this->set_cookie( $this->cookie_name( self::COOKIE_TICKET ), $data['ticket_id'], $cookie_options );
        }

        // Expires timestamp (Unix seconds, matching JWT exp claim).
        $this->set_cookie( $this->cookie_name( self::COOKIE_EXPIRES ), strval( $expires ), $cookie_options );

        // Meta cookie with JSON data (timestamps in Unix seconds).
        $meta = wp_json_encode( array(
            'createdAt' => time(),
            'expiresAt' => $expires,
        ) );
        $this->set_cookie( $this->cookie_name( self::COOKIE_META ), $meta, $cookie_options );
    }

    /**
     * Clear all verification cookies.
     */
    public function clear_verification_cookies() {
        $suffixes = array(
            self::COOKIE_TOKEN,
            self::COOKIE_VERIFIED,
            self::COOKIE_CREATOR,
            self::COOKIE_TICKET,
            self::COOKIE_EXPIRES,
            self::COOKIE_META,
        );

        foreach ( $suffixes as $suffix ) {
            $name = $this->cookie_name( $suffix );
            $this->set_cookie( $name, '', array(
                'expires'  => time() - 3600,
                'path'     => '/',
                'secure'   => $this->is_cookie_secure(),
                'httponly' => ( self::COOKIE_TOKEN === $suffix ),
                'samesite' => $this->settings['cookie_samesite'],
            ) );
            unset( $_COOKIE[ $name ] );
        }
    }

    /**
     * Set a cookie with PHP 7.2 compatibility (SameSite via header workaround).
     *
     * @param string $name    Cookie name.
     * @param string $value   Cookie value.
     * @param array  $options Cookie options.
     */
    private function set_cookie( $name, $value, $options ) {
        if ( PHP_VERSION_ID >= 70300 ) {
            setcookie( $name, $value, $options );
        } else {
            // PHP < 7.3 doesn't support SameSite in setcookie options array.
            $samesite = isset( $options['samesite'] ) ? $options['samesite'] : 'Lax';
            setcookie(
                $name,
                $value,
                $options['expires'],
                $options['path'] . '; SameSite=' . $samesite,
                '',
                $options['secure'],
                $options['httponly']
            );
        }
    }

    /**
     * Determine if cookies should use the Secure flag.
     *
     * @return bool
     */
    private function is_cookie_secure() {
        if ( 'auto' === $this->settings['cookie_secure'] ) {
            return is_ssl();
        }
        return (bool) $this->settings['cookie_secure'];
    }

    /**
     * Check if a URL path matches a glob-style pattern.
     *
     * @param string $path    URL path.
     * @param string $pattern Glob pattern (supports * wildcard).
     * @return bool
     */
    public function path_matches( $path, $pattern ) {
        $path    = '/' . ltrim( $path, '/' );
        $pattern = '/' . ltrim( $pattern, '/' );

        // Convert glob pattern to regex.
        $regex = str_replace(
            array( '\*', '\?' ),
            array( '.*', '.' ),
            preg_quote( $pattern, '#' )
        );

        return (bool) preg_match( '#^' . $regex . '$#i', $path );
    }

    /**
     * Log a debug message if debug mode is enabled.
     *
     * @param string $message Log message.
     * @param mixed  $data    Optional data to log.
     */
    public function debug_log( $message, $data = null ) {
        if ( empty( $this->settings['debug'] ) ) {
            return;
        }

        $entry = '[ShowAd] ' . $message;
        if ( null !== $data ) {
            $entry .= ' | Data: ' . wp_json_encode( $data );
        }

        if ( defined( 'WP_DEBUG_LOG' ) && WP_DEBUG_LOG ) {
            // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
            error_log( $entry );
        }
    }

    /**
     * Render HTML meta tags for the client-side SDK.
     *
     * @return string
     */
    public function render_meta_tags() {
        $html  = '<meta name="showad-creator-hash" content="' . esc_attr( $this->settings['creator_hash'] ) . '">' . "\n";
        $html .= '<meta name="showad-api-url" content="' . esc_url( $this->settings['api_base_url'] ) . '">' . "\n";
        $html .= '<meta name="showad-video-url" content="' . esc_url( $this->settings['video_ad_url'] ) . '">' . "\n";
        $html .= '<meta name="showad-cookie-prefix" content="' . esc_attr( $this->settings['cookie_prefix'] ) . '">' . "\n";
        return $html;
    }

    /**
     * Check if the plugin is properly configured.
     *
     * @return array { @type bool $valid, @type string[] $errors }
     */
    public function validate_configuration() {
        $errors = array();

        if ( empty( $this->settings['creator_hash'] ) ) {
            $errors[] = __( 'Creator Hash is not configured.', 'showad-content-gate' );
        }
        if ( empty( $this->settings['api_key'] ) ) {
            $errors[] = __( 'API Key is not configured.', 'showad-content-gate' );
        }
        if ( empty( $this->settings['redirect_secret'] ) ) {
            $errors[] = __( 'Redirect Secret is not configured.', 'showad-content-gate' );
        }

        return array(
            'valid'  => empty( $errors ),
            'errors' => $errors,
        );
    }
}
