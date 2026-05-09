<?php
/**
 * Gutenberg block registration — showad/gate block.
 *
 * @package ShowAd
 */

namespace ShowAd;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Block {

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
     * Register the block.
     */
    public function init() {
        add_action( 'init', array( $this, 'register_block' ) );
        add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue_editor_assets' ) );
    }

    /**
     * Register the block type with server-side rendering.
     */
    public function register_block() {
        register_block_type( 'showad/gate', array(
            'api_version'     => 2,
            'editor_script'   => 'showad-block-editor',
            'editor_style'    => 'showad-block-editor-style',
            'render_callback' => array( $this, 'render_gate_block' ),
            'attributes'      => array(
                'unverifiedMessage' => array(
                    'type'    => 'string',
                    'default' => '',
                ),
                'buttonText'        => array(
                    'type'    => 'string',
                    'default' => 'Watch Ad to Unlock',
                ),
                'autoRedirect'      => array(
                    'type'    => 'boolean',
                    'default' => false,
                ),
                'className'         => array(
                    'type'    => 'string',
                    'default' => '',
                ),
            ),
        ) );
    }

    /**
     * Enqueue block editor assets.
     */
    public function enqueue_editor_assets() {
        wp_enqueue_script(
            'showad-block-editor',
            SHOWAD_PLUGIN_URL . 'assets/js/block-editor.js',
            array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-i18n' ),
            SHOWAD_VERSION,
            false
        );

        wp_enqueue_style(
            'showad-block-editor-style',
            SHOWAD_PLUGIN_URL . 'assets/css/block-editor.css',
            array( 'wp-edit-blocks' ),
            SHOWAD_VERSION
        );
    }

    /**
     * Server-side render callback for the gate block.
     *
     * @param array  $attributes Block attributes.
     * @param string $content    Block inner content.
     * @return string HTML output.
     */
    public function render_gate_block( $attributes, $content ) {
        $class_name  = ! empty( $attributes['className'] ) ? ' ' . esc_attr( $attributes['className'] ) : '';
        $button_text = ! empty( $attributes['buttonText'] ) ? esc_html( $attributes['buttonText'] ) : esc_html__( 'Watch Ad to Unlock', 'showad-content-gate' );

        if ( $this->manager->is_verified() ) {
            return '<div class="wp-block-showad-gate showad-gate--unlocked' . $class_name . '">' . $content . '</div>';
        }

        // Not verified.
        if ( ! empty( $attributes['unverifiedMessage'] ) ) {
            return '<div class="wp-block-showad-gate showad-gate--locked' . $class_name . '">' .
                   wp_kses_post( $attributes['unverifiedMessage'] ) .
                   '</div>';
        }

        $redirect_url  = esc_url( $this->manager->build_video_ad_redirect_url() );
        $auto_redirect = ! empty( $attributes['autoRedirect'] );

        $output = '<div class="wp-block-showad-gate showad-gate--locked' . $class_name . '">';
        $output .= '<div class="showad-gate__overlay">';
        $output .= '<div class="showad-gate__lock-icon">';
        $output .= '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
        $output .= '</div>';
        $output .= '<p class="showad-gate__message">' . esc_html__( 'This content is locked. Watch a short ad to unlock it.', 'showad-content-gate' ) . '</p>';
        $output .= '<a href="' . $redirect_url . '" class="showad-gate__button">' . $button_text . '</a>';
        $output .= '</div>';
        $output .= '</div>';

        if ( $auto_redirect ) {
            $output .= '<script>if(!window.ShowAd||!window.ShowAd.isVerified()){window.location.href=' . wp_json_encode( $redirect_url ) . ';}</script>';
        }

        return $output;
    }
}
