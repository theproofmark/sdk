<?php
/**
 * Admin settings page for ShowAd Content Gate.
 *
 * @package ShowAd
 */

namespace ShowAd\Admin;

use ShowAd\Manager;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Settings {

    /**
     * Manager instance.
     *
     * @var Manager
     */
    private $manager;

    /**
     * Option group name.
     *
     * @var string
     */
    private $option_group = 'showad_settings_group';

    /**
     * Option name in wp_options.
     *
     * @var string
     */
    private $option_name = 'showad_settings';

    /**
     * Constructor.
     *
     * @param Manager $manager ShowAd manager.
     */
    public function __construct( Manager $manager ) {
        $this->manager = $manager;
    }

    /**
     * Initialize admin hooks.
     */
    public function init() {
        add_action( 'admin_menu', array( $this, 'add_settings_page' ) );
        add_action( 'admin_init', array( $this, 'register_settings' ) );
        add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );
        add_action( 'admin_notices', array( $this, 'configuration_notice' ) );
    }

    /**
     * Show notice if plugin is not configured.
     */
    public function configuration_notice() {
        $config = $this->manager->validate_configuration();
        if ( $config['valid'] ) {
            return;
        }

        $screen = get_current_screen();
        if ( $screen && 'settings_page_showad-settings' === $screen->id ) {
            return;
        }

        echo '<div class="notice notice-warning is-dismissible"><p>';
        echo '<strong>' . esc_html__( 'ShowAd Content Gate', 'showad-content-gate' ) . ':</strong> ';
        echo esc_html__( 'Plugin requires configuration.', 'showad-content-gate' ) . ' ';
        echo '<a href="' . esc_url( admin_url( 'options-general.php?page=showad-settings' ) ) . '">' .
             esc_html__( 'Configure now', 'showad-content-gate' ) . '</a>';
        echo '</p></div>';
    }

    /**
     * Enqueue admin styles and scripts.
     *
     * @param string $hook_suffix Admin page hook suffix.
     */
    public function enqueue_admin_assets( $hook_suffix ) {
        if ( 'settings_page_showad-settings' !== $hook_suffix ) {
            return;
        }

        wp_enqueue_style(
            'showad-admin',
            SHOWAD_PLUGIN_URL . 'assets/css/admin.css',
            array(),
            SHOWAD_VERSION
        );

        wp_enqueue_script(
            'showad-admin',
            SHOWAD_PLUGIN_URL . 'assets/js/admin.js',
            array( 'jquery' ),
            SHOWAD_VERSION,
            true
        );

        wp_localize_script( 'showad-admin', 'showadAdmin', array(
            'ajax_url' => admin_url( 'admin-ajax.php' ),
            'nonce'    => wp_create_nonce( 'showad_admin_nonce' ),
            'strings'  => array(
                'testing'       => __( 'Testing connection...', 'showad-content-gate' ),
                'connected'     => __( 'Connected successfully!', 'showad-content-gate' ),
                'failed'        => __( 'Connection failed.', 'showad-content-gate' ),
                'saved'         => __( 'Settings saved.', 'showad-content-gate' ),
                'confirm_reset' => __( 'Are you sure you want to reset all settings to defaults?', 'showad-content-gate' ),
            ),
        ) );
    }

    /**
     * Add settings page under Settings menu.
     */
    public function add_settings_page() {
        add_options_page(
            __( 'ShowAd Content Gate', 'showad-content-gate' ),
            __( 'ShowAd', 'showad-content-gate' ),
            'manage_options',
            'showad-settings',
            array( $this, 'render_settings_page' )
        );
    }

    /**
     * Register settings, sections, and fields.
     */
    public function register_settings() {
        register_setting(
            $this->option_group,
            $this->option_name,
            array(
                'type'              => 'array',
                'sanitize_callback' => array( $this, 'sanitize_settings' ),
                'default'           => showad_get_default_settings(),
            )
        );

        // --- Credentials section ---
        add_settings_section(
            'showad_credentials',
            __( 'API Credentials', 'showad-content-gate' ),
            array( $this, 'render_credentials_section' ),
            'showad-settings'
        );

        add_settings_field(
            'creator_hash',
            __( 'Creator Hash', 'showad-content-gate' ),
            array( $this, 'render_text_field' ),
            'showad-settings',
            'showad_credentials',
            array(
                'key'         => 'creator_hash',
                'description' => __( 'Your unique creator identifier from ProofMark.', 'showad-content-gate' ),
                'required'    => true,
            )
        );

        add_settings_field(
            'api_key',
            __( 'API Key', 'showad-content-gate' ),
            array( $this, 'render_password_field' ),
            'showad-settings',
            'showad_credentials',
            array(
                'key'         => 'api_key',
                'description' => __( 'Secret API key for backend authentication. Starts with sk-.', 'showad-content-gate' ),
                'required'    => true,
            )
        );

        add_settings_field(
            'redirect_secret',
            __( 'Redirect Secret', 'showad-content-gate' ),
            array( $this, 'render_password_field' ),
            'showad-settings',
            'showad_credentials',
            array(
                'key'         => 'redirect_secret',
                'description' => __( 'Secret used for claiming redirect tickets.', 'showad-content-gate' ),
                'required'    => true,
            )
        );

        // --- URLs section ---
        add_settings_section(
            'showad_urls',
            __( 'Service URLs', 'showad-content-gate' ),
            array( $this, 'render_urls_section' ),
            'showad-settings'
        );

        add_settings_field(
            'api_base_url',
            __( 'API Base URL', 'showad-content-gate' ),
            array( $this, 'render_url_field' ),
            'showad-settings',
            'showad_urls',
            array(
                'key'         => 'api_base_url',
                'description' => __( 'ShowAd backend API URL.', 'showad-content-gate' ),
                'placeholder' => 'https://ad.proofmark.io',
            )
        );

        add_settings_field(
            'video_ad_url',
            __( 'Video Ad URL', 'showad-content-gate' ),
            array( $this, 'render_url_field' ),
            'showad-settings',
            'showad_urls',
            array(
                'key'         => 'video_ad_url',
                'description' => __( 'ShowAd video ad frontend URL.', 'showad-content-gate' ),
                'placeholder' => 'https://showad.proofmark.io',
            )
        );

        // --- Cookie section ---
        add_settings_section(
            'showad_cookies',
            __( 'Cookie Settings', 'showad-content-gate' ),
            array( $this, 'render_cookies_section' ),
            'showad-settings'
        );

        add_settings_field(
            'cookie_prefix',
            __( 'Cookie Prefix', 'showad-content-gate' ),
            array( $this, 'render_text_field' ),
            'showad-settings',
            'showad_cookies',
            array(
                'key'         => 'cookie_prefix',
                'description' => __( 'Prefix for all ShowAd cookies.', 'showad-content-gate' ),
            )
        );

        add_settings_field(
            'cookie_max_age',
            __( 'Cookie Max Age (seconds)', 'showad-content-gate' ),
            array( $this, 'render_number_field' ),
            'showad-settings',
            'showad_cookies',
            array(
                'key'         => 'cookie_max_age',
                'description' => __( 'How long verification lasts (default: 3600 = 1 hour).', 'showad-content-gate' ),
                'min'         => 60,
                'max'         => 86400,
            )
        );

        add_settings_field(
            'cookie_secure',
            __( 'Secure Cookies', 'showad-content-gate' ),
            array( $this, 'render_select_field' ),
            'showad-settings',
            'showad_cookies',
            array(
                'key'         => 'cookie_secure',
                'description' => __( 'Whether to set the Secure flag on cookies.', 'showad-content-gate' ),
                'options'     => array(
                    'auto'  => __( 'Auto-detect (HTTPS)', 'showad-content-gate' ),
                    '1'     => __( 'Always', 'showad-content-gate' ),
                    '0'     => __( 'Never', 'showad-content-gate' ),
                ),
            )
        );

        add_settings_field(
            'cookie_samesite',
            __( 'SameSite Policy', 'showad-content-gate' ),
            array( $this, 'render_select_field' ),
            'showad-settings',
            'showad_cookies',
            array(
                'key'         => 'cookie_samesite',
                'description' => __( 'SameSite attribute for cookies.', 'showad-content-gate' ),
                'options'     => array(
                    'Lax'    => 'Lax (recommended)',
                    'Strict' => 'Strict',
                    'None'   => 'None (requires Secure)',
                ),
            )
        );

        // --- Protection section ---
        add_settings_section(
            'showad_protection',
            __( 'Content Protection', 'showad-content-gate' ),
            array( $this, 'render_protection_section' ),
            'showad-settings'
        );

        add_settings_field(
            'protected_paths',
            __( 'Protected Paths', 'showad-content-gate' ),
            array( $this, 'render_textarea_field' ),
            'showad-settings',
            'showad_protection',
            array(
                'key'         => 'protected_paths',
                'description' => __( 'URL paths to protect (one per line). Supports * wildcards. Leave empty for shortcode/block-only mode.', 'showad-content-gate' ),
                'placeholder' => "/premium/*\n/members/*",
            )
        );

        add_settings_field(
            'excluded_paths',
            __( 'Excluded Paths', 'showad-content-gate' ),
            array( $this, 'render_textarea_field' ),
            'showad-settings',
            'showad_protection',
            array(
                'key'         => 'excluded_paths',
                'description' => __( 'URL paths to always exclude from protection (one per line).', 'showad-content-gate' ),
                'placeholder' => "/wp-admin/*\n/wp-login.php\n/wp-json/*",
            )
        );

        // --- Advanced section ---
        add_settings_section(
            'showad_advanced',
            __( 'Advanced', 'showad-content-gate' ),
            array( $this, 'render_advanced_section' ),
            'showad-settings'
        );

        add_settings_field(
            'debug',
            __( 'Debug Mode', 'showad-content-gate' ),
            array( $this, 'render_checkbox_field' ),
            'showad-settings',
            'showad_advanced',
            array(
                'key'         => 'debug',
                'description' => __( 'Enable debug logging to WP debug log and browser console.', 'showad-content-gate' ),
            )
        );
    }

    /**
     * Sanitize settings before saving.
     *
     * @param array $input Raw input.
     * @return array Sanitized settings.
     */
    public function sanitize_settings( $input ) {
        $sanitized = array();

        $sanitized['creator_hash']    = sanitize_text_field( $input['creator_hash'] ?? '' );
        $sanitized['api_key']         = sanitize_text_field( $input['api_key'] ?? '' );
        $sanitized['redirect_secret'] = sanitize_text_field( $input['redirect_secret'] ?? '' );
        $sanitized['api_base_url']    = esc_url_raw( $input['api_base_url'] ?? 'https://ad.proofmark.io' );
        $sanitized['video_ad_url']    = esc_url_raw( $input['video_ad_url'] ?? 'https://showad.proofmark.io' );
        $sanitized['cookie_prefix']   = preg_replace( '/[^a-zA-Z0-9_]/', '', $input['cookie_prefix'] ?? 'showad' );
        $sanitized['cookie_max_age']  = absint( $input['cookie_max_age'] ?? 3600 );
        $sanitized['cookie_secure']   = in_array( $input['cookie_secure'] ?? 'auto', array( 'auto', '0', '1' ), true ) ? $input['cookie_secure'] : 'auto';
        $sanitized['cookie_samesite'] = in_array( $input['cookie_samesite'] ?? 'Lax', array( 'Lax', 'Strict', 'None' ), true ) ? $input['cookie_samesite'] : 'Lax';
        $sanitized['protected_paths'] = sanitize_textarea_field( $input['protected_paths'] ?? '' );
        $sanitized['excluded_paths']  = sanitize_textarea_field( $input['excluded_paths'] ?? '' );
        $sanitized['debug']           = ! empty( $input['debug'] );

        // Enforce limits.
        if ( $sanitized['cookie_max_age'] < 60 ) {
            $sanitized['cookie_max_age'] = 60;
        }
        if ( $sanitized['cookie_max_age'] > 86400 ) {
            $sanitized['cookie_max_age'] = 86400;
        }

        // Strip trailing slashes from URLs.
        $sanitized['api_base_url'] = untrailingslashit( $sanitized['api_base_url'] );
        $sanitized['video_ad_url'] = untrailingslashit( $sanitized['video_ad_url'] );

        // Clear health check cache when settings change.
        delete_transient( 'showad_health_check' );

        add_settings_error(
            $this->option_name,
            'showad_settings_saved',
            __( 'Settings saved successfully.', 'showad-content-gate' ),
            'success'
        );

        return $sanitized;
    }

    // ---------------------------------------------------------------
    // Section renderers
    // ---------------------------------------------------------------

    public function render_credentials_section() {
        echo '<p>' . esc_html__( 'Enter your ProofMark ShowAd API credentials. These are available in your ProofMark dashboard.', 'showad-content-gate' ) . '</p>';
    }

    public function render_urls_section() {
        echo '<p>' . esc_html__( 'Default URLs work for most setups. Only change these if you have a custom deployment.', 'showad-content-gate' ) . '</p>';
    }

    public function render_cookies_section() {
        echo '<p>' . esc_html__( 'Configure how verification cookies are stored in the browser.', 'showad-content-gate' ) . '</p>';
    }

    public function render_protection_section() {
        echo '<p>' . esc_html__( 'Define which pages are automatically protected. You can also protect individual pieces of content using the [showad_gate] shortcode or the ShowAd Gate block.', 'showad-content-gate' ) . '</p>';
    }

    public function render_advanced_section() {
        echo '<p>' . esc_html__( 'Advanced configuration options.', 'showad-content-gate' ) . '</p>';
    }

    // ---------------------------------------------------------------
    // Field renderers
    // ---------------------------------------------------------------

    public function render_text_field( $args ) {
        $settings = $this->manager->get_settings();
        $key      = $args['key'];
        $value    = isset( $settings[ $key ] ) ? $settings[ $key ] : '';
        $required = ! empty( $args['required'] ) ? ' required' : '';

        printf(
            '<input type="text" id="%1$s" name="%2$s[%1$s]" value="%3$s" class="regular-text"%4$s>',
            esc_attr( $key ),
            esc_attr( $this->option_name ),
            esc_attr( $value ),
            $required // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
        );

        if ( ! empty( $args['description'] ) ) {
            echo '<p class="description">' . esc_html( $args['description'] ) . '</p>';
        }
    }

    public function render_password_field( $args ) {
        $settings = $this->manager->get_settings();
        $key      = $args['key'];
        $value    = isset( $settings[ $key ] ) ? $settings[ $key ] : '';
        $required = ! empty( $args['required'] ) ? ' required' : '';

        printf(
            '<input type="password" id="%1$s" name="%2$s[%1$s]" value="%3$s" class="regular-text showad-password-field" autocomplete="off"%4$s>',
            esc_attr( $key ),
            esc_attr( $this->option_name ),
            esc_attr( $value ),
            $required // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
        );
        echo '<button type="button" class="button button-secondary showad-toggle-password" data-target="' . esc_attr( $key ) . '">' .
             esc_html__( 'Show', 'showad-content-gate' ) . '</button>';

        if ( ! empty( $args['description'] ) ) {
            echo '<p class="description">' . esc_html( $args['description'] ) . '</p>';
        }
    }

    public function render_url_field( $args ) {
        $settings    = $this->manager->get_settings();
        $key         = $args['key'];
        $value       = isset( $settings[ $key ] ) ? $settings[ $key ] : '';
        $placeholder = isset( $args['placeholder'] ) ? $args['placeholder'] : '';

        printf(
            '<input type="url" id="%1$s" name="%2$s[%1$s]" value="%3$s" class="regular-text" placeholder="%4$s">',
            esc_attr( $key ),
            esc_attr( $this->option_name ),
            esc_attr( $value ),
            esc_attr( $placeholder )
        );

        if ( ! empty( $args['description'] ) ) {
            echo '<p class="description">' . esc_html( $args['description'] ) . '</p>';
        }
    }

    public function render_number_field( $args ) {
        $settings = $this->manager->get_settings();
        $key      = $args['key'];
        $value    = isset( $settings[ $key ] ) ? $settings[ $key ] : '';
        $min      = isset( $args['min'] ) ? $args['min'] : 0;
        $max      = isset( $args['max'] ) ? $args['max'] : '';

        printf(
            '<input type="number" id="%1$s" name="%2$s[%1$s]" value="%3$s" class="small-text" min="%4$s" max="%5$s">',
            esc_attr( $key ),
            esc_attr( $this->option_name ),
            esc_attr( $value ),
            esc_attr( $min ),
            esc_attr( $max )
        );

        if ( ! empty( $args['description'] ) ) {
            echo '<p class="description">' . esc_html( $args['description'] ) . '</p>';
        }
    }

    public function render_select_field( $args ) {
        $settings = $this->manager->get_settings();
        $key      = $args['key'];
        $value    = isset( $settings[ $key ] ) ? $settings[ $key ] : '';
        $options  = isset( $args['options'] ) ? $args['options'] : array();

        echo '<select id="' . esc_attr( $key ) . '" name="' . esc_attr( $this->option_name ) . '[' . esc_attr( $key ) . ']">';
        foreach ( $options as $opt_val => $opt_label ) {
            printf(
                '<option value="%s"%s>%s</option>',
                esc_attr( $opt_val ),
                selected( $value, $opt_val, false ),
                esc_html( $opt_label )
            );
        }
        echo '</select>';

        if ( ! empty( $args['description'] ) ) {
            echo '<p class="description">' . esc_html( $args['description'] ) . '</p>';
        }
    }

    public function render_textarea_field( $args ) {
        $settings    = $this->manager->get_settings();
        $key         = $args['key'];
        $value       = isset( $settings[ $key ] ) ? $settings[ $key ] : '';
        $placeholder = isset( $args['placeholder'] ) ? $args['placeholder'] : '';

        printf(
            '<textarea id="%1$s" name="%2$s[%1$s]" class="large-text" rows="4" placeholder="%3$s">%4$s</textarea>',
            esc_attr( $key ),
            esc_attr( $this->option_name ),
            esc_attr( $placeholder ),
            esc_textarea( $value )
        );

        if ( ! empty( $args['description'] ) ) {
            echo '<p class="description">' . esc_html( $args['description'] ) . '</p>';
        }
    }

    public function render_checkbox_field( $args ) {
        $settings = $this->manager->get_settings();
        $key      = $args['key'];
        $value    = ! empty( $settings[ $key ] );

        printf(
            '<label><input type="checkbox" id="%1$s" name="%2$s[%1$s]" value="1"%3$s> %4$s</label>',
            esc_attr( $key ),
            esc_attr( $this->option_name ),
            checked( $value, true, false ),
            esc_html( $args['description'] ?? '' )
        );
    }

    // ---------------------------------------------------------------
    // Settings page template
    // ---------------------------------------------------------------

    public function render_settings_page() {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }

        $config = $this->manager->validate_configuration();
        ?>
        <div class="wrap showad-settings-wrap">
            <h1>
                <span class="showad-logo">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16" fill="#4fc3f7"/></svg>
                </span>
                <?php echo esc_html( get_admin_page_title() ); ?>
            </h1>

            <?php if ( ! $config['valid'] ) : ?>
                <div class="notice notice-warning inline">
                    <p><strong><?php esc_html_e( 'Configuration incomplete:', 'showad-content-gate' ); ?></strong></p>
                    <ul>
                        <?php foreach ( $config['errors'] as $error ) : ?>
                            <li><?php echo esc_html( $error ); ?></li>
                        <?php endforeach; ?>
                    </ul>
                </div>
            <?php endif; ?>

            <?php settings_errors( $this->option_name ); ?>

            <div class="showad-settings-layout">
                <div class="showad-settings-main">
                    <form method="post" action="options.php">
                        <?php
                        settings_fields( $this->option_group );
                        do_settings_sections( 'showad-settings' );
                        submit_button( __( 'Save Settings', 'showad-content-gate' ) );
                        ?>
                    </form>
                </div>

                <div class="showad-settings-sidebar">
                    <!-- Connection test -->
                    <div class="showad-card">
                        <h3><?php esc_html_e( 'Connection Test', 'showad-content-gate' ); ?></h3>
                        <p><?php esc_html_e( 'Test the connection to the ShowAd backend.', 'showad-content-gate' ); ?></p>
                        <button type="button" class="button" id="showad-test-connection">
                            <?php esc_html_e( 'Test Connection', 'showad-content-gate' ); ?>
                        </button>
                        <div id="showad-connection-result" style="margin-top:10px;"></div>
                    </div>

                    <!-- Quick start guide -->
                    <div class="showad-card">
                        <h3><?php esc_html_e( 'Quick Start', 'showad-content-gate' ); ?></h3>
                        <ol>
                            <li><?php esc_html_e( 'Enter your API credentials above.', 'showad-content-gate' ); ?></li>
                            <li><?php esc_html_e( 'Use the [showad_gate] shortcode, the ShowAd Gate block, or configure protected paths.', 'showad-content-gate' ); ?></li>
                            <li><?php esc_html_e( 'Users watch a video ad and gain access.', 'showad-content-gate' ); ?></li>
                        </ol>
                    </div>

                    <!-- Shortcode reference -->
                    <div class="showad-card">
                        <h3><?php esc_html_e( 'Shortcode Reference', 'showad-content-gate' ); ?></h3>
                        <dl>
                            <dt><code>[showad_gate]...[/showad_gate]</code></dt>
                            <dd><?php esc_html_e( 'Wrap premium content — hidden until verified.', 'showad-content-gate' ); ?></dd>
                            <dt><code>[showad_verified]...[/showad_verified]</code></dt>
                            <dd><?php esc_html_e( 'Only shown to verified users.', 'showad-content-gate' ); ?></dd>
                            <dt><code>[showad_unverified]...[/showad_unverified]</code></dt>
                            <dd><?php esc_html_e( 'Only shown to unverified users.', 'showad-content-gate' ); ?></dd>
                            <dt><code>[showad_redirect_button]</code></dt>
                            <dd><?php esc_html_e( 'Render a "Watch Ad" button.', 'showad-content-gate' ); ?></dd>
                            <dt><code>[showad_expiry format="mm:ss"]</code></dt>
                            <dd><?php esc_html_e( 'Countdown timer until verification expires.', 'showad-content-gate' ); ?></dd>
                        </dl>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }
}
