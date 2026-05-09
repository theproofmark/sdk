<?php
/**
 * Shortcode registration — [showad_gate] and [showad_redirect].
 *
 * @package ShowAd
 */

namespace ShowAd;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Shortcodes {

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
     * Register shortcodes.
     */
    public function init() {
        add_shortcode( 'showad_gate', array( $this, 'gate_shortcode' ) );
        add_shortcode( 'showad_verified', array( $this, 'verified_shortcode' ) );
        add_shortcode( 'showad_unverified', array( $this, 'unverified_shortcode' ) );
        add_shortcode( 'showad_redirect_url', array( $this, 'redirect_url_shortcode' ) );
        add_shortcode( 'showad_redirect_button', array( $this, 'redirect_button_shortcode' ) );
        add_shortcode( 'showad_expiry', array( $this, 'expiry_shortcode' ) );
        add_shortcode( 'showad_debug', array( $this, 'debug_shortcode' ) );
    }

    /**
     * [showad_gate] — Gate content behind ad verification.
     *
     * Usage:
     *   [showad_gate]Premium content here[/showad_gate]
     *   [showad_gate unverified="Please watch an ad to unlock"]Premium content[/showad_gate]
     *   [showad_gate auto_redirect="true"]Content[/showad_gate]
     *
     * @param array  $atts    Shortcode attributes.
     * @param string $content Enclosed content.
     * @return string HTML output.
     */
    public function gate_shortcode( $atts, $content = null ) {
        $atts = shortcode_atts( array(
            'unverified'    => '',
            'loading'       => '',
            'auto_redirect' => 'false',
            'button_text'   => __( 'Watch Ad to Unlock', 'showad-content-gate' ),
            'class'         => '',
        ), $atts, 'showad_gate' );

        if ( $this->manager->is_verified() ) {
            $output = do_shortcode( $content );
            if ( ! empty( $atts['class'] ) ) {
                return '<div class="' . esc_attr( $atts['class'] ) . '">' . $output . '</div>';
            }
            return $output;
        }

        // Not verified — show unverified content.
        if ( ! empty( $atts['unverified'] ) ) {
            return '<div class="showad-gate showad-gate--locked ' . esc_attr( $atts['class'] ) . '">' .
                   wp_kses_post( $atts['unverified'] ) .
                   '</div>';
        }

        // Default locked UI.
        $redirect_url = esc_url( $this->manager->build_video_ad_redirect_url() );
        $auto         = filter_var( $atts['auto_redirect'], FILTER_VALIDATE_BOOLEAN );
        $button_text  = esc_html( $atts['button_text'] );

        $output = '<div class="showad-gate showad-gate--locked ' . esc_attr( $atts['class'] ) . '">';
        $output .= '<div class="showad-gate__overlay">';
        $output .= '<div class="showad-gate__lock-icon">';
        $output .= '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
        $output .= '</div>';
        $output .= '<p class="showad-gate__message">' . esc_html__( 'This content is locked. Watch a short ad to unlock it.', 'showad-content-gate' ) . '</p>';
        $output .= '<a href="' . $redirect_url . '" class="showad-gate__button">' . $button_text . '</a>';
        $output .= '</div>';
        $output .= '</div>';

        if ( $auto ) {
            $output .= '<script>if(!window.ShowAd||!window.ShowAd.isVerified()){window.location.href=' . wp_json_encode( $redirect_url ) . ';}</script>';
        }

        return $output;
    }

    /**
     * [showad_verified] — Only render content when verified.
     *
     * @param array  $atts    Shortcode attributes.
     * @param string $content Enclosed content.
     * @return string
     */
    public function verified_shortcode( $atts, $content = null ) {
        if ( $this->manager->is_verified() ) {
            return do_shortcode( $content );
        }
        return '';
    }

    /**
     * [showad_unverified] — Only render content when NOT verified.
     *
     * @param array  $atts    Shortcode attributes.
     * @param string $content Enclosed content.
     * @return string
     */
    public function unverified_shortcode( $atts, $content = null ) {
        if ( ! $this->manager->is_verified() ) {
            return do_shortcode( $content );
        }
        return '';
    }

    /**
     * [showad_redirect_url] — Output the video ad redirect URL.
     *
     * @param array $atts Shortcode attributes.
     * @return string
     */
    public function redirect_url_shortcode( $atts ) {
        $atts = shortcode_atts( array(
            'return_url' => null,
        ), $atts, 'showad_redirect_url' );

        return esc_url( $this->manager->build_video_ad_redirect_url( $atts['return_url'] ) );
    }

    /**
     * [showad_redirect_button] — Render a redirect button/link.
     *
     * @param array  $atts    Shortcode attributes.
     * @param string $content Button text content.
     * @return string
     */
    public function redirect_button_shortcode( $atts, $content = null ) {
        $atts = shortcode_atts( array(
            'text'       => __( 'Watch Ad to Unlock', 'showad-content-gate' ),
            'class'      => 'showad-redirect-button',
            'return_url' => null,
        ), $atts, 'showad_redirect_button' );

        $button_text = ! empty( $content ) ? wp_kses_post( $content ) : esc_html( $atts['text'] );
        $url         = esc_url( $this->manager->build_video_ad_redirect_url( $atts['return_url'] ) );

        return '<a href="' . $url . '" class="' . esc_attr( $atts['class'] ) . '">' . $button_text . '</a>';
    }

    /**
     * [showad_expiry] — Display verification expiry countdown.
     *
     * @param array $atts Shortcode attributes.
     * @return string
     */
    public function expiry_shortcode( $atts ) {
        $atts = shortcode_atts( array(
            'format' => 'mm:ss',
            'class'  => 'showad-expiry-countdown',
        ), $atts, 'showad_expiry' );

        $format = esc_attr( $atts['format'] );
        $class  = esc_attr( $atts['class'] );

        return '<span class="' . $class . '" data-showad-expiry data-format="' . $format . '"></span>';
    }

    /**
     * [showad_debug] — Show debug panel (only in WP_DEBUG mode).
     *
     * @param array $atts Shortcode attributes.
     * @return string
     */
    public function debug_shortcode( $atts ) {
        if ( ! defined( 'WP_DEBUG' ) || ! WP_DEBUG ) {
            return '';
        }

        $state       = $this->manager->get_verification_state();
        $config      = $this->manager->validate_configuration();
        $is_verified = $state['is_verified'] ? 'Yes' : 'No';
        $reason      = esc_html( $state['reason'] );

        $output = '<div class="showad-debug" style="position:fixed;bottom:10px;right:10px;background:#1a1a2e;color:#e0e0e0;padding:16px;border-radius:8px;font-family:monospace;font-size:12px;z-index:99999;max-width:320px;box-shadow:0 4px 12px rgba(0,0,0,0.3);">';
        $output .= '<div style="font-weight:bold;margin-bottom:8px;color:#4fc3f7;">ShowAd Debug</div>';
        $output .= '<div>Verified: <strong style="color:' . ( $state['is_verified'] ? '#66bb6a' : '#ef5350' ) . ';">' . $is_verified . '</strong></div>';
        $output .= '<div>Reason: ' . $reason . '</div>';
        $output .= '<div>Creator: ' . esc_html( $state['creator_hash'] ?? 'N/A' ) . '</div>';

        if ( $state['expires_at'] ) {
            $output .= '<div>Expires: <span data-showad-expiry data-format="mm:ss"></span></div>';
        }

        if ( ! $config['valid'] ) {
            $output .= '<div style="color:#ff9800;margin-top:8px;">Config Issues:</div>';
            foreach ( $config['errors'] as $err ) {
                $output .= '<div style="color:#ff9800;">• ' . esc_html( $err ) . '</div>';
            }
        }

        $output .= '</div>';
        return $output;
    }
}
