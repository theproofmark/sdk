<?php
/**
 * Main plugin class — singleton orchestrator.
 *
 * @package ShowAd
 */

namespace ShowAd;

// Prevent direct access.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Plugin {

    /**
     * Singleton instance.
     *
     * @var Plugin|null
     */
    private static $instance = null;

    /**
     * ShowAd manager instance.
     *
     * @var Manager
     */
    private $manager;

    /**
     * Admin settings instance.
     *
     * @var Admin\Settings
     */
    private $settings;

    /**
     * Get singleton instance.
     *
     * @return Plugin
     */
    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Prevent cloning.
     */
    private function __clone() {}

    /**
     * Constructor — private for singleton.
     */
    private function __construct() {
        $this->manager = new Manager();
    }

    /**
     * Initialize plugin hooks.
     */
    public function init() {
        // Load template tag functions.
        require_once SHOWAD_PLUGIN_DIR . 'includes/template-tags.php';

        // Admin settings page.
        if ( is_admin() ) {
            $this->settings = new Admin\Settings( $this->manager );
            $this->settings->init();

            $ajax = new Admin\AjaxHandler( $this->manager );
            $ajax->init();
        }

        // Register shortcodes.
        $shortcodes = new Shortcodes( $this->manager );
        $shortcodes->init();

        // Register Gutenberg block (WP 5.0+).
        if ( function_exists( 'register_block_type' ) ) {
            $block = new Block( $this->manager );
            $block->init();
        }

        // Register widget.
        add_action( 'widgets_init', function () {
            register_widget( '\ShowAd\Widget' );
        });

        // Middleware — intercept requests for protected paths.
        $middleware = new Middleware( $this->manager );
        $middleware->init();

        // Enqueue front-end scripts.
        add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_assets' ) );

        // REST API endpoint for AJAX ticket claiming.
        add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );
    }

    /**
     * Get the ShowAd manager.
     *
     * @return Manager
     */
    public function get_manager() {
        return $this->manager;
    }

    /**
     * Enqueue front-end JavaScript and CSS.
     */
    public function enqueue_frontend_assets() {
        wp_enqueue_script(
            'showad-fingerprint',
            SHOWAD_PLUGIN_URL . 'assets/js/fingerprint.js',
            array(),
            SHOWAD_VERSION,
            true
        );

        wp_enqueue_script(
            'showad-client',
            SHOWAD_PLUGIN_URL . 'assets/js/showad-client.js',
            array( 'showad-fingerprint' ),
            SHOWAD_VERSION,
            true
        );

        $settings = $this->manager->get_settings();

        wp_localize_script( 'showad-client', 'showadConfig', array(
            'creatorHash'  => $settings['creator_hash'],
            'apiBaseUrl'   => $settings['api_base_url'],
            'videoAdUrl'   => $settings['video_ad_url'],
            'cookiePrefix' => $settings['cookie_prefix'],
            'cookieMaxAge' => intval( $settings['cookie_max_age'] ),
            'debug'        => (bool) $settings['debug'],
            'restUrl'      => esc_url_raw( rest_url( 'showad/v1/' ) ),
            'restNonce'    => wp_create_nonce( 'wp_rest' ),
        ) );

        wp_enqueue_style(
            'showad-gate',
            SHOWAD_PLUGIN_URL . 'assets/css/showad-gate.css',
            array(),
            SHOWAD_VERSION
        );
    }

    /**
     * Register REST API routes.
     */
    public function register_rest_routes() {
        register_rest_route( 'showad/v1', '/claim-ticket', array(
            'methods'             => 'POST',
            'callback'            => array( $this, 'rest_claim_ticket' ),
            'permission_callback' => '__return_true',
            'args'                => array(
                'ticket_id' => array(
                    'required'          => true,
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                    'validate_callback' => function ( $value ) {
                        return ! empty( $value ) && preg_match( '/^[a-zA-Z0-9_-]+$/', $value );
                    },
                ),
            ),
        ) );

        register_rest_route( 'showad/v1', '/validate-token', array(
            'methods'             => 'POST',
            'callback'            => array( $this, 'rest_validate_token' ),
            'permission_callback' => '__return_true',
            'args'                => array(
                'token' => array(
                    'required'          => true,
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
            ),
        ) );

        register_rest_route( 'showad/v1', '/health', array(
            'methods'             => 'GET',
            'callback'            => array( $this, 'rest_health_check' ),
            'permission_callback' => '__return_true',
        ) );
    }

    /**
     * REST callback: claim a redirect ticket.
     *
     * @param \WP_REST_Request $request Request object.
     * @return \WP_REST_Response
     */
    public function rest_claim_ticket( \WP_REST_Request $request ) {
        $ticket_id = $request->get_param( 'ticket_id' );

        try {
            $result = $this->manager->claim_redirect_ticket( $ticket_id );
            return new \WP_REST_Response( $result, 200 );
        } catch ( ShowAdException $e ) {
            return new \WP_REST_Response(
                array(
                    'error'   => $e->get_error_name(),
                    'message' => $e->getMessage(),
                    'code'    => $e->getCode(),
                ),
                $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 500
            );
        }
    }

    /**
     * REST callback: validate a token.
     *
     * @param \WP_REST_Request $request Request object.
     * @return \WP_REST_Response
     */
    public function rest_validate_token( \WP_REST_Request $request ) {
        $token = $request->get_param( 'token' );

        try {
            $result = $this->manager->validate_token_remote( $token );
            return new \WP_REST_Response( $result, 200 );
        } catch ( ShowAdException $e ) {
            return new \WP_REST_Response(
                array(
                    'error'   => $e->get_error_name(),
                    'message' => $e->getMessage(),
                ),
                500
            );
        }
    }

    /**
     * REST callback: health check.
     *
     * @param \WP_REST_Request $request Request object.
     * @return \WP_REST_Response
     */
    public function rest_health_check( \WP_REST_Request $request ) {
        $health = $this->manager->check_backend_health();
        $status = $health['healthy'] ? 200 : 503;
        return new \WP_REST_Response( $health, $status );
    }
}
