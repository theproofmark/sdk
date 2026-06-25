# frozen_string_literal: true

module ProofMark
  module Verify
    # Custom error class for ProofMark Verify SDK errors
    class Error < StandardError
      attr_reader :code

      # @param code [String] Error code (PMV_TIMEOUT, PMV_NETWORK_ERROR, PMV_HTTP_ERROR, PMV_INVALID_RESPONSE)
      # @param message [String] Error message
      def initialize(code, message)
        super(message)
        @code = code
      end
    end
  end
end
