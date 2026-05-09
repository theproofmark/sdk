/**
 * ShowAd Admin Settings JavaScript.
 *
 * @version 1.0.0
 */
(function ($) {
  'use strict';

  // Toggle password visibility.
  $(document).on('click', '.showad-toggle-password', function () {
    var target = $(this).data('target');
    var input = $('#' + target);
    if (input.attr('type') === 'password') {
      input.attr('type', 'text');
      $(this).text(showadAdmin.strings.hide || 'Hide');
    } else {
      input.attr('type', 'password');
      $(this).text(showadAdmin.strings.show || 'Show');
    }
  });

  // Connection test.
  $('#showad-test-connection').on('click', function () {
    var $btn = $(this);
    var $result = $('#showad-connection-result');

    $btn.prop('disabled', true);
    $result.html('<span style="color:#999;">' + showadAdmin.strings.testing + '</span>');

    $.ajax({
      url: showadAdmin.ajax_url,
      method: 'POST',
      data: {
        action: 'showad_test_connection',
        nonce: showadAdmin.nonce
      },
      success: function (response) {
        if (response.success) {
          $result.html('<span style="color:#46b450;">&#10004; ' + showadAdmin.strings.connected + '</span>');
        } else {
          $result.html('<span style="color:#dc3232;">&#10006; ' + (response.data || showadAdmin.strings.failed) + '</span>');
        }
      },
      error: function () {
        $result.html('<span style="color:#dc3232;">&#10006; ' + showadAdmin.strings.failed + '</span>');
      },
      complete: function () {
        $btn.prop('disabled', false);
      }
    });
  });

  // Register AJAX handler on the server side via admin_init.
  // This is handled in includes/Admin/AjaxHandler.php

})(jQuery);
