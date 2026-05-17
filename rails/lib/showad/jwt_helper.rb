# frozen_string_literal: true

require 'base64'
require 'json'

module ShowAd
  # JWT inspection helpers. The SDK never verifies the JWT signature locally —
  # signature verification is the backend's responsibility — so this module
  # only handles decoding the payload and validating the public claims that
  # the publisher cares about (expiry, creator binding, fingerprint binding,
  # issuer).
  #
  # Defense-in-depth: rejects tokens whose header `alg` is `none` or outside
  # the HS256/HS384/HS512/RS256/RS384/RS512/ES256/ES384 whitelist.
  module JwtHelper
    EXPECTED_ISSUER = 'showad-backend'

    ALLOWED_ALGORITHMS = %w[HS256 HS384 HS512 RS256 RS384 RS512 ES256 ES384].freeze

    DEFAULT_LEEWAY_SECONDS = 60

    module_function

    # Decode the payload of a 3-part JWT without verifying the signature.
    # Returns nil for malformed input or disallowed algorithms.
    # @return [Hash, nil]
    def decode_token(token)
      return nil if token.nil? || token.empty?

      parts = token.to_s.split('.')
      return nil if parts.length != 3

      header_json = decode_base64_url(parts[0])
      return nil if header_json.nil?

      begin
        header = JSON.parse(header_json)
      rescue JSON::ParserError
        return nil
      end
      return nil unless header.is_a?(Hash)
      alg = header['alg']
      return nil unless alg.is_a?(String) && ALLOWED_ALGORITHMS.include?(alg)

      payload = decode_base64_url(parts[1])
      return nil if payload.nil?

      begin
        claims = JSON.parse(payload)
      rescue JSON::ParserError
        return nil
      end

      claims.is_a?(Hash) ? claims : nil
    end

    # @return [Boolean] true if the token is missing/malformed/expired or has
    #   an `nbf`/`iat` claim still in the future (beyond `leeway_seconds`).
    def token_expired?(token, leeway_seconds: DEFAULT_LEEWAY_SECONDS)
      claims = decode_token(token)
      return true if claims.nil?

      now = Time.now.to_i
      leeway = leeway_seconds.to_i

      return true if claims['exp'].is_a?(Numeric) && (claims['exp'].to_i + leeway) < now
      return true if claims['nbf'].is_a?(Numeric) && (claims['nbf'].to_i - leeway) > now
      return true if claims['iat'].is_a?(Numeric) && (claims['iat'].to_i - leeway) > now

      false
    end

    # @return [Integer, nil] expiry as Unix seconds (matches JWT `exp` claim),
    #   or nil when no `exp` claim is present.
    def token_expiry(token)
      claims = decode_token(token)
      return nil if claims.nil? || !claims['exp'].is_a?(Numeric)

      claims['exp'].to_i
    end

    # Validate a token's claims against expected values.
    # @param options [Hash] :leeway_seconds (Integer), :require_issuer (Boolean)
    # @return [Hash] `{ valid: Boolean, reason: String|nil }`
    def validate_token_claims(token, expected_creator_hash, expected_fingerprint = nil, options = {})
      leeway = (options[:leeway_seconds] || DEFAULT_LEEWAY_SECONDS).to_i
      require_issuer = options.key?(:require_issuer) ? !!options[:require_issuer] : true

      claims = decode_token(token)
      return invalid('Invalid token format') if claims.nil?

      return invalid('Token expired') if token_expired?(token, leeway_seconds: leeway)

      token_creator = claims['creator_hash']
      if !token_creator.is_a?(String) || !safe_equal(token_creator, expected_creator_hash.to_s)
        return invalid('Creator hash mismatch')
      end

      if !expected_fingerprint.nil? && !expected_fingerprint.to_s.empty?
        token_fp = claims['fingerprint']
        if !token_fp.is_a?(String) || !safe_equal(token_fp, expected_fingerprint.to_s)
          return invalid('Fingerprint mismatch')
        end
      end

      iss = claims['iss']
      if require_issuer
        return invalid('Invalid issuer') if iss != EXPECTED_ISSUER
      elsif !iss.nil? && iss != EXPECTED_ISSUER
        return invalid('Invalid issuer')
      end

      { valid: true, reason: nil }
    end

    def creator_hash_from(token)
      claims = decode_token(token)
      claims && claims['creator_hash']
    end

    def fingerprint_from(token)
      claims = decode_token(token)
      claims && claims['fingerprint']
    end

    def session_hash_from(token)
      claims = decode_token(token)
      claims && claims['session_hash']
    end

    # Constant-time string comparison (avoids ActiveSupport dependency).
    def safe_equal(a, b)
      return false if a.bytesize != b.bytesize

      diff = 0
      a_bytes = a.bytes
      b_bytes = b.bytes
      a_bytes.each_with_index { |byte, i| diff |= byte ^ b_bytes[i] }
      diff.zero?
    end

    def decode_base64_url(value)
      padding_needed = (4 - value.length % 4) % 4
      padded = value + ('=' * padding_needed)
      Base64.urlsafe_decode64(padded)
    rescue ArgumentError
      nil
    end

    def invalid(reason)
      { valid: false, reason: reason }
    end

    class << self
      private :invalid
    end
  end
end
