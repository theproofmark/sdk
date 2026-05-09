<?php

define( 'ABSPATH', __DIR__ . '/' );

function __( $text, $domain = null ) {
    return $text;
}

function get_option( $name, $default = array() ) {
    return $name === 'showad_settings' ? showad_get_default_settings() : $default;
}

function showad_get_default_settings() {
    return array(
        'creator_hash'    => 'creator-1',
        'api_key'         => 'sk-test',
        'redirect_secret' => 'secret',
        'api_base_url'    => 'https://ad.example.com',
        'video_ad_url'    => 'https://showad.example.com',
        'cookie_prefix'   => 'showad',
        'cookie_max_age'  => 3600,
        'cookie_secure'   => false,
        'cookie_samesite' => 'Lax',
        'protected_paths' => '',
        'excluded_paths'  => '',
        'debug'           => false,
    );
}

function wp_parse_args( $args, $defaults = array() ) {
    return array_merge( $defaults, $args );
}

function sanitize_text_field( $value ) {
    return is_scalar( $value ) ? trim( (string) $value ) : '';
}

function wp_unslash( $value ) {
    return $value;
}

function trailingslashit( $value ) {
    return rtrim( $value, '/' ) . '/';
}

function wp_json_encode( $value ) {
    return json_encode( $value );
}

function wp_remote_post( $url, $args = array() ) {
    $GLOBALS['showad_remote_calls'][] = array(
        'url'  => $url,
        'args' => $args,
    );

    return array_shift( $GLOBALS['showad_remote_responses'] );
}

function is_wp_error( $value ) {
    return false;
}

function wp_remote_retrieve_response_code( $response ) {
    return isset( $response['response']['code'] ) ? $response['response']['code'] : 0;
}

function wp_remote_retrieve_body( $response ) {
    return isset( $response['body'] ) ? $response['body'] : '';
}

function get_transient( $name ) {
    return false;
}

function set_transient( $name, $value, $expiration ) {
    return true;
}

function is_ssl() {
    return true;
}

function add_query_arg( $args, $url ) {
    return $url . '?' . http_build_query( $args );
}

require_once __DIR__ . '/../includes/ShowAdException.php';
require_once __DIR__ . '/../includes/JwtHelper.php';
require_once __DIR__ . '/../includes/Manager.php';

function showad_test_token( $claims ) {
    $header  = rtrim( strtr( base64_encode( json_encode( array( 'alg' => 'none', 'typ' => 'JWT' ) ) ), '+/', '-_' ), '=' );
    $payload = rtrim( strtr( base64_encode( json_encode( $claims ) ), '+/', '-_' ), '=' );
    return $header . '.' . $payload . '.forged';
}

function showad_assert( $condition, $message ) {
    if ( ! $condition ) {
        fwrite( STDERR, $message . PHP_EOL );
        exit( 1 );
    }
}

$token = showad_test_token( array(
    'creator_hash' => 'creator-1',
    'fingerprint'  => 'fp-1',
    'iss'          => 'showad-backend',
    'exp'          => time() + 3600,
) );

$_COOKIE = array(
    'showad_token'       => $token,
    'showad_fingerprint' => 'fp-1',
);
$GLOBALS['showad_remote_calls']     = array();
$GLOBALS['showad_remote_responses'] = array(
    array(
        'response' => array( 'code' => 200 ),
        'body'     => wp_json_encode( array( 'valid' => false, 'message' => 'signature invalid' ) ),
    ),
);

$manager = new \ShowAd\Manager();
$result  = $manager->verify_request();

showad_assert( ! $result['verified'], 'Forged token was allowed without authoritative backend validation.' );
showad_assert( count( $GLOBALS['showad_remote_calls'] ) === 1, 'Backend validation was not called for forged token.' );

$_COOKIE = array(
    'showad_token'       => $token,
    'showad_fingerprint' => 'fp-1',
);
$GLOBALS['showad_remote_calls']     = array();
$GLOBALS['showad_remote_responses'] = array(
    array(
        'response' => array( 'code' => 200 ),
        'body'     => wp_json_encode( array( 'valid' => true ) ),
    ),
);

$manager = new \ShowAd\Manager();
$result  = $manager->verify_request();

showad_assert( $result['verified'], 'Backend-valid token was rejected.' );
showad_assert( count( $GLOBALS['showad_remote_calls'] ) === 1, 'Valid token did not validate through backend.' );

echo "WordPress verify_request smoke passed.\n";
