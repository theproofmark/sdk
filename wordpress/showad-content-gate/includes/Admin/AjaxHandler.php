<?php
/**
 * Admin AJAX handler — connection test and related actions.
 *
 * @package ShowAd
 */

namespace ShowAd\Admin;

use ShowAd\Manager;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class AjaxHandler {

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
     * Register AJAX hooks.
     */
    public function init() {
        add_action( 'wp_ajax_showad_test_connection', array( $this, 'test_connection' ) );
    }

    /**
     * AJAX: Test connection to ShowAd backend.
     */
    public function test_connection() {
        check_ajax_referer( 'showad_admin_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( __( 'Insufficient permissions.', 'showad-content-gate' ) );
        }

        $result = $this->manager->check_backend_health();

        if ( $result['healthy'] ) {
            wp_send_json_success( $result['message'] );
        } else {
            wp_send_json_error( $result['message'] );
        }
    }
}
