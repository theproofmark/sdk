<?php
/**
 * Request middleware — intercepts requests to protected paths, handles
 * redirect-ticket claiming and token validation on page load.
 *
 * @package ShowAd
 */

namespace ShowAd;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Middleware {

    /**
     * Manager instance.
     *
     * @var Manager
     */
    private $manager;

    /**
     * Constructor.
     *
     * @param Manager $manager ShowAd manager.
     */
    public function __construct( Manager $manager ) {
        $this->manager = $manager;
    }

    /**
     * Register middleware hooks.
     */
    public function init() {
        // Run early in template_redirect to intercept before output.
        add_action( 'template_redirect', array( $this, 'handle_request' ), 5 );
    }

    /**
     * Handle incoming request.
     */
    public function handle_request() {
        // Skip admin, AJAX, cron, REST API requests.
        if ( is_admin() || wp_doing_ajax() || wp_doing_cron() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
            return;
        }

        $request_path = $this->get_request_path();
        $settings     = $this->manager->get_settings();

        // Check excluded paths.
        $excluded_paths = $this->parse_paths( $settings['excluded_paths'] );
        foreach ( $excluded_paths as $pattern ) {
            if ( $this->manager->path_matches( $request_path, $pattern ) ) {
                $this->manager->debug_log( 'Path excluded: ' . $request_path );
                return;
            }
        }

        // Check if this path is protected.
        $protected_paths = $this->parse_paths( $settings['protected_paths'] );
        if ( empty( $protected_paths ) ) {
            // No global path protection configured — shortcode/block only mode.
            // Still need to handle redirect tickets.
            $this->handle_redirect_ticket_if_present();
            return;
        }

        $is_protected = false;
        foreach ( $protected_paths as $pattern ) {
            if ( $this->manager->path_matches( $request_path, $pattern ) ) {
                $is_protected = true;
                break;
            }
        }

        if ( ! $is_protected ) {
            $this->handle_redirect_ticket_if_present();
            return;
        }

        // Server-side access policy: verified crawlers, trusted CIDRs, premium users.
        $policy_decision = $this->evaluate_access_policy();
        if ( 'allow' === ( $policy_decision['action'] ?? 'continue' ) ) {
            $this->manager->debug_log( 'Access policy bypass: ' . ( $policy_decision['reason'] ?? 'unknown' ) );
            return;
        }
        if ( 'redirect' === ( $policy_decision['action'] ?? 'continue' ) ) {
            $this->manager->debug_log( 'Access policy redirect: ' . ( $policy_decision['reason'] ?? 'unknown' ) );
            $target = $policy_decision['redirect_url'] ?? $this->manager->build_video_ad_redirect_url();
            wp_redirect( $target, 302 );
            exit;
        }

        // Path is protected — check for redirect ticket first.
        if ( $this->handle_redirect_ticket() ) {
            return; // Redirect was issued.
        }

        // Verify existing token.
        $result = $this->manager->verify_request();

        if ( $result['verified'] ) {
            $this->manager->debug_log( 'Request verified for path: ' . $request_path );
            return;
        }

        // Not verified — redirect to video ad.
        $this->manager->debug_log( 'Redirecting to video ad: ' . $result['reason'] );
        $this->manager->clear_verification_cookies();

        $redirect_url = $this->manager->build_video_ad_redirect_url();
        wp_redirect( $redirect_url, 302 );
        exit;
    }

    /**
     * Handle redirect_ticket parameter if present in URL (non-protected pages).
     * Claims the ticket and sets cookies without enforcing protection.
     */
    private function handle_redirect_ticket_if_present() {
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended
        if ( empty( $_GET['redirect_ticket'] ) ) {
            return;
        }

        $this->handle_redirect_ticket();
    }

    /**
     * Handle redirect_ticket parameter — claim ticket and set cookies.
     *
     * @return bool True if a redirect was issued, false otherwise.
     */
    private function handle_redirect_ticket() {
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended
        if ( empty( $_GET['redirect_ticket'] ) ) {
            return false;
        }

        // phpcs:ignore WordPress.Security.NonceVerification.Recommended
        $ticket_id = sanitize_text_field( wp_unslash( $_GET['redirect_ticket'] ) );

        // Validate ticket ID format.
        if ( ! preg_match( '/^[a-zA-Z0-9_-]+$/', $ticket_id ) ) {
            $this->manager->debug_log( 'Invalid redirect ticket format: ' . $ticket_id );
            return false;
        }

        $this->manager->debug_log( 'Claiming redirect ticket: ' . $ticket_id );

        try {
            $result = $this->manager->claim_redirect_ticket( $ticket_id );
        } catch ( ShowAdException $e ) {
            $this->manager->debug_log( 'Ticket claim failed: ' . $e->getMessage() );
            return false;
        }

        // Extract token from result.
        $token = '';
        if ( isset( $result['token'] ) ) {
            $token = $result['token'];
        } elseif ( isset( $result['data']['token'] ) ) {
            $token = $result['data']['token'];
        }

        if ( empty( $token ) ) {
            $this->manager->debug_log( 'No token in ticket claim response.' );
            return false;
        }

        // Verify creator hash from token matches config.
        $token_creator = JwtHelper::get_creator_hash_from_token( $token );
        $settings      = $this->manager->get_settings();

        if ( ! empty( $settings['creator_hash'] ) && $token_creator !== $settings['creator_hash'] ) {
            $this->manager->debug_log( 'Creator hash mismatch in claimed token.' );
            return false;
        }

        // Set verification cookies.
        $this->manager->set_verification_cookies( array(
            'token'        => $token,
            'ticket_id'    => $ticket_id,
            'creator_hash' => $settings['creator_hash'],
        ) );

        // Redirect to clean URL (remove redirect_ticket param).
        $clean_url = remove_query_arg( 'redirect_ticket' );
        wp_redirect( $clean_url, 302 );
        exit;
    }

    /**
     * Evaluate the access policy. Publishers configure trusted CIDRs and
     * crawler families through the `showad_access_policy` filter; premium-user
     * decisions go through `showad_access_policy_decision` (server-side only).
     *
     * @return array
     */
    private function evaluate_access_policy() {
        /**
         * Filter: showad_access_policy
         *
         * Lets the host site provide access policy configuration without
         * editing plugin settings. Default is empty (continue to verification).
         */
        $config = apply_filters( 'showad_access_policy', array() );
        if ( empty( $config ) ) {
            return array( 'action' => 'continue' );
        }

        $evaluator = new AccessPolicy();
        return $evaluator->evaluate( $config );
    }

    /**
     * Get the current request path relative to home URL.
     *
     * @return string
     */
    private function get_request_path() {
        $home_path = wp_parse_url( home_url(), PHP_URL_PATH );
        $home_path = $home_path ? trailingslashit( $home_path ) : '/';

        $request_uri = isset( $_SERVER['REQUEST_URI'] )
            ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) )
            : '/';

        // Remove query string.
        $path = strtok( $request_uri, '?' );

        // Make relative to home path.
        if ( 0 === strpos( $path, $home_path ) ) {
            $path = substr( $path, strlen( $home_path ) );
        }

        return '/' . ltrim( $path, '/' );
    }

    /**
     * Parse a newline/comma-separated path string into an array.
     *
     * @param string $paths Path patterns.
     * @return array
     */
    private function parse_paths( $paths ) {
        if ( empty( $paths ) ) {
            return array();
        }

        $paths = str_replace( array( "\r\n", "\r" ), "\n", $paths );
        $items = preg_split( '/[\n,]+/', $paths );
        $items = array_map( 'trim', $items );
        $items = array_filter( $items );

        return $items;
    }
}
