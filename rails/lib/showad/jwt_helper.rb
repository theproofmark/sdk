# frozen_string_literal: true

require 'base64'
require 'json'

module ShowAd
  # JWT inspection helpers. The SDK never verifies the JWT signature locally —
  # signature verification is the backend's responsibility — so this module
  # only handles decoding the payload and validating the public claims that
  # the publisher cares about (expiry, creator binding, fingerprint binding,
  # issuer).
  module JwtHelper
    EXPECTED_ISSUER = 'showad-backend'

    module_function

    # Decode the payload of a 3-part JWT without verifying the signature.
    # @return [Hash, nil] Hash of claims, or nil for malformed input.
    def decode_token(token)
      return nil if token.nil? || token.empty?

      parts = token.to_s.split('.')
      return nil if parts.length != 3

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
    #   an `nbf` claim still in the future.
    def token_expired?(token)
      claims = decode_token(token)
      return true if claims.nil?

      now = Time.now.to_i
      return true if claims['exp'].is_a?(Numeric) && claims['exp'] < now
      return true if claims['nbf'].is_a?(Numeric) && claims['nbf'] > now

      false
    end

    # @return [Integer, nil] expiry in **milliseconds** for parity with the
    #   Laravel and Next.js SDKs, or nil when no `exp` claim is present.
    def token_expiry(token)
      claims = decode_token(token)
      return nil if claims.nil? || !claims['exp'].is_a?(Numeric)

      (claims['exp'] * 1000).to_i
    end

    # Validate a token's claims against expected values.
    # @return [Hash] `{ valid: Boolean, reason: String|nil }`
    def validate_token_claims(token, expected_creator_hash, expected_fingerprint = nil)
      claims = decode_token(token)
      return invalid('Invalid token format') if claims.nil?

      return invalid('Token expired') if token_expired?(token)

      if claims['creator_hash'].nil? || claims['creator_hash'] != expected_creator_hash
        return invalid('Creator hash mismatch')
      end

      if !expected_fingerprint.nil? && !expected_fingerprint.empty? &&
         (claims['fingerprint'].nil? || claims['fingerprint'] != expected_fingerprint)
        return invalid('Fingerprint mismatch')
      end

      if claims.key?('iss') && claims['iss'] != EXPECTED_ISSUER
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
