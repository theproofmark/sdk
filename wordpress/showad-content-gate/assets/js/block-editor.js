/**
 * Gutenberg Block Editor — ShowAd Gate Block.
 *
 * @version 1.0.0
 */
(function (wp) {
  'use strict';

  var el = wp.element.createElement;
  var registerBlockType = wp.blocks.registerBlockType;
  var InnerBlocks = wp.blockEditor.InnerBlocks;
  var InspectorControls = wp.blockEditor.InspectorControls;
  var PanelBody = wp.components.PanelBody;
  var TextControl = wp.components.TextControl;
  var ToggleControl = wp.components.ToggleControl;
  var TextareaControl = wp.components.TextareaControl;
  var __ = wp.i18n.__;

  registerBlockType('showad/gate', {
    title: __('ShowAd Content Gate', 'showad-content-gate'),
    description: __('Gate content behind ad-verified access. Users watch a video ad to unlock.', 'showad-content-gate'),
    icon: el('svg', { width: 24, height: 24, viewBox: '0 0 24 24' },
      el('rect', { x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }),
      el('path', { d: 'M7 11V7a5 5 0 0 1 10 0v4', fill: 'none', stroke: 'currentColor', strokeWidth: 2 })
    ),
    category: 'widgets',
    keywords: [
      __('paywall', 'showad-content-gate'),
      __('premium', 'showad-content-gate'),
      __('gate', 'showad-content-gate'),
      __('ad', 'showad-content-gate'),
      __('showad', 'showad-content-gate'),
      __('lock', 'showad-content-gate')
    ],
    supports: {
      align: true,
      className: true,
      html: false
    },
    attributes: {
      unverifiedMessage: {
        type: 'string',
        default: ''
      },
      buttonText: {
        type: 'string',
        default: 'Watch Ad to Unlock'
      },
      autoRedirect: {
        type: 'boolean',
        default: false
      }
    },

    edit: function (props) {
      var attributes = props.attributes;

      return el(
        'div',
        { className: props.className },
        el(InspectorControls, {},
          el(PanelBody, { title: __('Gate Settings', 'showad-content-gate'), initialOpen: true },
            el(TextControl, {
              label: __('Button Text', 'showad-content-gate'),
              value: attributes.buttonText,
              onChange: function (val) { props.setAttributes({ buttonText: val }); },
              help: __('Text shown on the unlock button.', 'showad-content-gate')
            }),
            el(TextareaControl, {
              label: __('Custom Locked Message (HTML)', 'showad-content-gate'),
              value: attributes.unverifiedMessage,
              onChange: function (val) { props.setAttributes({ unverifiedMessage: val }); },
              help: __('Custom HTML for unverified users. Leave empty for default lock UI.', 'showad-content-gate')
            }),
            el(ToggleControl, {
              label: __('Auto-redirect', 'showad-content-gate'),
              checked: attributes.autoRedirect,
              onChange: function (val) { props.setAttributes({ autoRedirect: val }); },
              help: __('Automatically redirect unverified users to the video ad.', 'showad-content-gate')
            })
          )
        ),
        el('div', {
          style: {
            border: '2px dashed #4fc3f7',
            borderRadius: '8px',
            padding: '16px',
            position: 'relative',
            minHeight: '80px'
          }
        },
          el('div', {
            style: {
              position: 'absolute',
              top: '-12px',
              left: '12px',
              background: '#fff',
              padding: '0 8px',
              color: '#4fc3f7',
              fontSize: '12px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }
          },
            el('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
              el('rect', { x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 }),
              el('path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' })
            ),
            __('ShowAd Gated Content', 'showad-content-gate')
          ),
          el(InnerBlocks, {
            renderAppender: InnerBlocks.ButtonBlockAppender
          })
        )
      );
    },

    save: function () {
      // Render is server-side.
      return el(InnerBlocks.Content);
    }
  });
})(window.wp);
