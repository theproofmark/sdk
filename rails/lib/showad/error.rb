# frozen_string_literal: true

module ShowAd
  # Base error class for the ShowAd SDK. All concrete errors below inherit from
  # this so callers can rescue `ShowAd::Error` to catch any SDK-originated
  # failure regardless of cause.
  class Error < StandardError
    attr_reader :context

    def initialize(message = nil, context: {})
      super(message)
      @context = context || {}
    end
  end

  # 410 from /api/redirect-ticket/:id/claim — ticket already consumed/expired.
  class TicketNotFound < Error; end

  # 401 from claim endpoint, or any other claim-time failure that is not a
  # network problem and not a creator mismatch.
  class TicketClaimFailed < Error; end

  # 403 from claim endpoint — the ticket belonged to a different creator.
  class CreatorMismatch < Error; end

  # `/api/sdk/validate` returned `valid:false` or otherwise rejected the token.
  class TokenInvalid < Error; end

  # Transport-level failure (DNS, TCP, TLS, timeout, malformed response, etc.).
  class NetworkError < Error; end

  # Required configuration value is missing or invalid.
  class ConfigError < Error; end
end
