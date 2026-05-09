<?php
/**
 * ShowAd Gate Widget — classic WordPress widget for sidebar/widget areas.
 *
 * @package ShowAd
 */

namespace ShowAd;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Widget extends \WP_Widget {

    /**
     * Constructor.
     */
    public function __construct() {
        parent::__construct(
            'showad_gate_widget',
            __( 'ShowAd Content Gate', 'showad-content-gate' ),
            array(
                'description'                 => __( 'Gate content behind ad-verified access.', 'showad-content-gate' ),
                'customize_selective_refresh' => true,
            )
        );
    }

    /**
     * Front-end widget output.
     *
     * @param array $args     Widget arguments.
     * @param array $instance Widget settings.
     */
    public function widget( $args, $instance ) {
        $plugin  = Plugin::get_instance();
        $manager = $plugin->get_manager();

        echo $args['before_widget']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped

        if ( ! empty( $instance['title'] ) ) {
            echo $args['before_title'] . esc_html( apply_filters( 'widget_title', $instance['title'] ) ) . $args['after_title']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
        }

        if ( $manager->is_verified() ) {
            if ( ! empty( $instance['verified_content'] ) ) {
                echo wp_kses_post( $instance['verified_content'] );
            } else {
                echo '<p>' . esc_html__( 'Content unlocked!', 'showad-content-gate' ) . '</p>';
            }
        } else {
            $redirect_url = esc_url( $manager->build_video_ad_redirect_url() );
            $button_text  = ! empty( $instance['button_text'] ) ? esc_html( $instance['button_text'] ) : esc_html__( 'Watch Ad to Unlock', 'showad-content-gate' );

            if ( ! empty( $instance['unverified_content'] ) ) {
                echo wp_kses_post( $instance['unverified_content'] );
            } else {
                echo '<p>' . esc_html__( 'This content is locked.', 'showad-content-gate' ) . '</p>';
            }
            echo '<a href="' . $redirect_url . '" class="showad-gate__button showad-widget-button">' . $button_text . '</a>';
        }

        echo $args['after_widget']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }

    /**
     * Widget admin form.
     *
     * @param array $instance Current widget settings.
     */
    public function form( $instance ) {
        $title              = isset( $instance['title'] ) ? $instance['title'] : '';
        $verified_content   = isset( $instance['verified_content'] ) ? $instance['verified_content'] : '';
        $unverified_content = isset( $instance['unverified_content'] ) ? $instance['unverified_content'] : '';
        $button_text        = isset( $instance['button_text'] ) ? $instance['button_text'] : __( 'Watch Ad to Unlock', 'showad-content-gate' );
        ?>
        <p>
            <label for="<?php echo esc_attr( $this->get_field_id( 'title' ) ); ?>"><?php esc_html_e( 'Title:', 'showad-content-gate' ); ?></label>
            <input class="widefat" type="text"
                   id="<?php echo esc_attr( $this->get_field_id( 'title' ) ); ?>"
                   name="<?php echo esc_attr( $this->get_field_name( 'title' ) ); ?>"
                   value="<?php echo esc_attr( $title ); ?>">
        </p>
        <p>
            <label for="<?php echo esc_attr( $this->get_field_id( 'verified_content' ) ); ?>"><?php esc_html_e( 'Verified Content (HTML):', 'showad-content-gate' ); ?></label>
            <textarea class="widefat" rows="4"
                      id="<?php echo esc_attr( $this->get_field_id( 'verified_content' ) ); ?>"
                      name="<?php echo esc_attr( $this->get_field_name( 'verified_content' ) ); ?>"><?php echo esc_textarea( $verified_content ); ?></textarea>
        </p>
        <p>
            <label for="<?php echo esc_attr( $this->get_field_id( 'unverified_content' ) ); ?>"><?php esc_html_e( 'Unverified Content (HTML):', 'showad-content-gate' ); ?></label>
            <textarea class="widefat" rows="4"
                      id="<?php echo esc_attr( $this->get_field_id( 'unverified_content' ) ); ?>"
                      name="<?php echo esc_attr( $this->get_field_name( 'unverified_content' ) ); ?>"><?php echo esc_textarea( $unverified_content ); ?></textarea>
        </p>
        <p>
            <label for="<?php echo esc_attr( $this->get_field_id( 'button_text' ) ); ?>"><?php esc_html_e( 'Button Text:', 'showad-content-gate' ); ?></label>
            <input class="widefat" type="text"
                   id="<?php echo esc_attr( $this->get_field_id( 'button_text' ) ); ?>"
                   name="<?php echo esc_attr( $this->get_field_name( 'button_text' ) ); ?>"
                   value="<?php echo esc_attr( $button_text ); ?>">
        </p>
        <?php
    }

    /**
     * Widget settings update handler.
     *
     * @param array $new_instance New values.
     * @param array $old_instance Old values.
     * @return array Sanitized values.
     */
    public function update( $new_instance, $old_instance ) {
        $instance                       = array();
        $instance['title']              = sanitize_text_field( $new_instance['title'] );
        $instance['verified_content']   = wp_kses_post( $new_instance['verified_content'] );
        $instance['unverified_content'] = wp_kses_post( $new_instance['unverified_content'] );
        $instance['button_text']        = sanitize_text_field( $new_instance['button_text'] );
        return $instance;
    }
}
