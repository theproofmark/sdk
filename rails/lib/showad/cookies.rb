# frozen_string_literal: true

module ShowAd
  # Cookie name suffix constants. The actual cookie names are built by
  # combining `Config#cookie_prefix` with these suffixes (default prefix is
  # `showad`, so e.g. `showad_token`).
  module Cookies
    FINGERPRINT = 'fingerprint'
    TOKEN       = 'token'
    CREATOR     = 'creator'
    TICKET      = 'ticket'
    VERIFIED    = 'verified'
    EXPIRES     = 'expires'

    ALL = [FINGERPRINT, TOKEN, CREATOR, TICKET, VERIFIED, EXPIRES].freeze
  end
end
