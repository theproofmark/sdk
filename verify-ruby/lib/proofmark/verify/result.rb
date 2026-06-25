# frozen_string_literal: true

module ProofMark
  module Verify
    # Result of a siteverify API call
    class Result
      attr_reader :success, :score, :flags, :credit, :challenge_ts, :hostname, :action, :error_codes

      # @param success [Boolean] Token valid + unredeemed + matches secret
      # @param score [Float] Risk score 0.0-1.0 (higher = more confident human)
      # @param flags [Array<String>] Risk signals (datacenter_ip, fast_completion, etc.)
      # @param credit [Boolean] True if this was a billable verification
      # @param challenge_ts [String, nil] ISO timestamp when challenge was solved
      # @param hostname [String, nil] Hostname where the challenge ran
      # @param action [String, nil] Action label if set
      # @param error_codes [Array<String>] Present only when success=false
      def initialize(success:, score:, flags:, credit:, challenge_ts: nil, hostname: nil, action: nil, error_codes: [])
        @success = success
        @score = score
        @flags = flags
        @credit = credit
        @challenge_ts = challenge_ts
        @hostname = hostname
        @action = action
        @error_codes = error_codes
      end

      # Alias for ergonomics
      # @return [Boolean] Same as success
      def success?
        @success
      end

      # Check if the result represents a human above the given score threshold
      # @param min_score [Float] Minimum score threshold (default 0.5)
      # @return [Boolean] True if success and score >= min_score
      def human?(min_score = 0.5)
        @success && @score >= min_score
      end

      # Parse and normalize API response JSON into a Result
      # @param hash [Hash] Raw API response
      # @return [Result]
      def self.from_json(hash)
        hash ||= {}
        new(
          success: hash["success"] == true,
          score: (hash["score"] || 0).to_f,
          flags: Array(hash["flags"]).map(&:to_s),
          credit: hash["credit"] == true,
          challenge_ts: hash["challenge_ts"],
          hostname: hash["hostname"],
          action: hash["action"],
          error_codes: Array(hash["error-codes"]).map(&:to_s)
        )
      end
    end
  end
end
