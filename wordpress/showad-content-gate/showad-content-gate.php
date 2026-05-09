<?php
/**
 * Plugin Name:       ShowAd Content Gate
 * Plugin URI:        https://proofmark.io/showad
 * Description:       Gate premium content behind ad-verified access using ProofMark ShowAd. Users watch a video ad to unlock protected content with fingerprint-based verification.
 * Version:           1.0.0
 * Requires at least: 5.0
 * Requires PHP:      7.2
 * Author:            ProofMark
 * Author URI:        https://proofmark.io
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       showad-content-gate
 * Domain Path:       /languages
 */

// Prevent direct file access.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Plugin version constant.
define( 'SHOWAD_VERSION', '1.0.0' );

// Plugin directory path.
define( 'SHOWAD_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );

// Plugin directory URL.
define( 'SHOWAD_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

// Plugin basename for hooks.
define( 'SHOWAD_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

// Minimum WordPress version.
define( 'SHOWAD_MIN_WP_VERSION', '5.0' );

// Minimum PHP version.
define( 'SHOWAD_MIN_PHP_VERSION', '7.2' );

/**
 * Autoload plugin classes.
 */
spl_autoload_register( function ( $class ) {
    $prefix    = 'ShowAd\\';
    $base_dir  = SHOWAD_PLUGIN_DIR . 'includes/';

    $len = strlen( $prefix );
    if ( strncmp( $prefix, $class, $len ) !== 0 ) {
        return;
    }

    $relative_class = substr( $class, $len );
    $file           = $base_dir . str_replace( '\\', '/', $relative_class ) . '.php';

    if ( file_exists( $file ) ) {
        require $file;
    }
});

/**
 * Check plugin requirements on activation.
 */
function showad_check_requirements() {
    $errors = array();

    if ( version_compare( PHP_VERSION, SHOWAD_MIN_PHP_VERSION, '<' ) ) {
        $errors[] = sprintf(
            /* translators: 1: Required PHP version, 2: Current PHP version */
            esc_html__( 'ShowAd Content Gate requires PHP %1$s or higher. You are running PHP %2$s.', 'showad-content-gate' ),
            SHOWAD_MIN_PHP_VERSION,
            PHP_VERSION
        );
    }

    global $wp_version;
    if ( version_compare( $wp_version, SHOWAD_MIN_WP_VERSION, '<' ) ) {
        $errors[] = sprintf(
            /* translators: 1: Required WP version, 2: Current WP version */
            esc_html__( 'ShowAd Content Gate requires WordPress %1$s or higher. You are running WordPress %2$s.', 'showad-content-gate' ),
            SHOWAD_MIN_WP_VERSION,
            $wp_version
        );
    }

    return $errors;
}

/**
 * Plugin activation hook.
 */
function showad_activate() {
    $errors = showad_check_requirements();
    if ( ! empty( $errors ) ) {
        deactivate_plugins( SHOWAD_PLUGIN_BASENAME );
        wp_die(
            wp_kses_post( implode( '<br>', $errors ) ),
            esc_html__( 'Plugin Activation Error', 'showad-content-gate' ),
            array( 'back_link' => true )
        );
    }

    // Set default options if not already present.
    if ( false === get_option( 'showad_settings' ) ) {
        add_option( 'showad_settings', showad_get_default_settings() );
    }

    // Flush rewrite rules for our custom endpoint.
    flush_rewrite_rules();
}
register_activation_hook( __FILE__, 'showad_activate' );

/**
 * Plugin deactivation hook.
 */
function showad_deactivate() {
    flush_rewrite_rules();
}
register_deactivation_hook( __FILE__, 'showad_deactivate' );

/**
 * Get default plugin settings.
 *
 * @return array Default settings.
 */
function showad_get_default_settings() {
    return array(
        'creator_hash'     => '',
        'api_key'          => '',
        'redirect_secret'  => '',
        'api_base_url'     => 'https://ad.proofmark.io',
        'video_ad_url'     => 'https://showad.proofmark.io',
        'cookie_prefix'    => 'showad',
        'cookie_max_age'   => 3600,
        'cookie_secure'    => 'auto',
        'cookie_samesite'  => 'Lax',
        'protected_paths'  => '',
        'excluded_paths'   => '',
        'debug'            => false,
    );
}

/**
 * Initialize the plugin.
 */
function showad_init() {
    $errors = showad_check_requirements();
    if ( ! empty( $errors ) ) {
        add_action( 'admin_notices', function () use ( $errors ) {
            echo '<div class="notice notice-error"><p>';
            echo wp_kses_post( implode( '<br>', $errors ) );
            echo '</p></div>';
        });
        return;
    }

    // Load text domain for translations.
    load_plugin_textdomain( 'showad-content-gate', false, dirname( SHOWAD_PLUGIN_BASENAME ) . '/languages' );

    // Initialize core plugin components.
    $plugin = \ShowAd\Plugin::get_instance();
    $plugin->init();
}
add_action( 'plugins_loaded', 'showad_init' );

/**
 * Add settings link to plugin action links.
 *
 * @param array $links Existing action links.
 * @return array Modified action links.
 */
function showad_plugin_action_links( $links ) {
    $settings_link = sprintf(
        '<a href="%s">%s</a>',
        esc_url( admin_url( 'options-general.php?page=showad-settings' ) ),
        esc_html__( 'Settings', 'showad-content-gate' )
    );
    array_unshift( $links, $settings_link );
    return $links;
}
add_filter( 'plugin_action_links_' . SHOWAD_PLUGIN_BASENAME, 'showad_plugin_action_links' );
