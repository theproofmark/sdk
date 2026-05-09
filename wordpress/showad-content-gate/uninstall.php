<?php
/**
 * Uninstall handler for ShowAd Content Gate.
 *
 * Fired when the plugin is deleted via the WordPress admin.
 * Removes all plugin options and transients from the database.
 *
 * @package ShowAd
 */

// Abort if not called by WordPress.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
    exit;
}

// Remove plugin options.
delete_option( 'showad_settings' );

// Remove any transients the plugin may have set.
delete_transient( 'showad_health_check' );

// Clear any scheduled cron events.
$timestamp = wp_next_scheduled( 'showad_health_check_event' );
if ( $timestamp ) {
    wp_unschedule_event( $timestamp, 'showad_health_check_event' );
}
