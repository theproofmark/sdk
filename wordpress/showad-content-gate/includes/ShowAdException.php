<?php
/**
 * ShowAd exception class with error codes.
 *
 * @package ShowAd
 */

namespace ShowAd;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class ShowAdException extends \Exception {

    const FINGERPRINT_FAILED = 1001;
    const TICKET_NOT_FOUND   = 1002;
    const TICKET_EXPIRED     = 1003;
    const TICKET_CLAIM_FAILED = 1004;
    const TOKEN_INVALID      = 1005;
    const TOKEN_EXPIRED      = 1006;
    const CREATOR_MISMATCH   = 1007;
    const NETWORK_ERROR      = 1008;
    const CONFIG_ERROR       = 1009;

    /**
     * Error code to name mapping.
     *
     * @var array
     */
    private static $error_names = array(
        self::FINGERPRINT_FAILED  => 'FINGERPRINT_FAILED',
        self::TICKET_NOT_FOUND    => 'TICKET_NOT_FOUND',
        self::TICKET_EXPIRED      => 'TICKET_EXPIRED',
        self::TICKET_CLAIM_FAILED => 'TICKET_CLAIM_FAILED',
        self::TOKEN_INVALID       => 'TOKEN_INVALID',
        self::TOKEN_EXPIRED       => 'TOKEN_EXPIRED',
        self::CREATOR_MISMATCH    => 'CREATOR_MISMATCH',
        self::NETWORK_ERROR       => 'NETWORK_ERROR',
        self::CONFIG_ERROR        => 'CONFIG_ERROR',
    );

    /**
     * Additional error details.
     *
     * @var array
     */
    private $details;

    /**
     * Constructor.
     *
     * @param string     $message  Error message.
     * @param int        $code     Error code from class constants.
     * @param array      $details  Optional additional details.
     * @param \Throwable $previous Previous exception.
     */
    public function __construct( $message = '', $code = 0, $details = array(), $previous = null ) {
        $this->details = $details;
        parent::__construct( $message, $code, $previous );
    }

    /**
     * Get the human-readable error name.
     *
     * @return string
     */
    public function get_error_name() {
        return isset( self::$error_names[ $this->getCode() ] )
            ? self::$error_names[ $this->getCode() ]
            : 'UNKNOWN_ERROR';
    }

    /**
     * Get additional error details.
     *
     * @return array
     */
    public function get_details() {
        return $this->details;
    }
}
