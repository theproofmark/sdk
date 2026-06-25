# frozen_string_literal: true

require_relative "verify/version"
require_relative "verify/error"
require_relative "verify/result"
require_relative "verify/client"

module ProofMark
  module Verify
    # Convenience method: ProofMark::Verify.new(...) -> Client
    # @param kwargs [Hash] Client constructor options
    # @return [Client]
    def self.new(**kwargs)
      Client.new(**kwargs)
    end
  end
end
