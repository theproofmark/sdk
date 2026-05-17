<?php
/**
 * Template tags — helper functions for use in WordPress themes.
 *
 * These functions provide a clean API for theme developers to integrate
 * ShowAd without using shortcodes or blocks.
 *
 * @package ShowAd
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Check if the current visitor is ad-verified.
 *
 * @return bool
 */
function showad_is_verified() {
    $plugin = \ShowAd\Plugin::get_instance();
    return $plugin->get_manager()->is_verified();
}

/**
 * Get the full verification state.
 *
 * @return array {
 *     @type bool        $is_verified  Whether the user is verified.
 *     @type string      $reason       Verification reason code.
 *     @type string|null $creator_hash Creator hash.
 *     @type int|null    $expires_at   Expiry in Unix seconds (matches JWT `exp` claim).
 *     @type string|null $redirect_url Video ad redirect URL.
 * }
 */
function showad_get_verification_state() {
    $plugin = \ShowAd\Plugin::get_instance();
    return $plugin->get_manager()->get_verification_state();
}

/**
 * Get the video ad redirect URL.
 *
 * @param string|null $return_url Optional return URL.
 * @return string
 */
function showad_redirect_url( $return_url = null ) {
    $plugin = \ShowAd\Plugin::get_instance();
    return $plugin->get_manager()->build_video_ad_redirect_url( $return_url );
}

/**
 * Render ShowAd meta tags (for themes that need client-side config).
 *
 * @return string HTML meta tags.
 */
function showad_meta_tags() {
    $plugin = \ShowAd\Plugin::get_instance();
    return $plugin->get_manager()->render_meta_tags();
}

/**
 * Conditionally render content based on verification status.
 *
 * Usage:
 *   showad_gate(
 *       '<p>This is premium content</p>',
 *       '<p>Please watch an ad to unlock</p>'
 *   );
 *
 * @param string      $verified_content   Content for verified users.
 * @param string|null $unverified_content Content for unverified users (optional).
 */
function showad_gate( $verified_content, $unverified_content = null ) {
    if ( showad_is_verified() ) {
        echo wp_kses_post( $verified_content );
    } elseif ( null !== $unverified_content ) {
        echo wp_kses_post( $unverified_content );
    }
}
