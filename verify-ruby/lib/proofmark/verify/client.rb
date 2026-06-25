# frozen_string_literal: true

require "net/http"
require "uri"
require "json"
require "timeout"

module ProofMark
  module Verify
    # Client for verifying ProofMark Verify tokens
    class Client
      DEFAULT_BASE_URL = "https://api.proofmark.com"
      DEFAULT_TIMEOUT = 5

      # @param secret [String] Your secret key (required)
      # @param base_url [String] Override for self-hosted/dev (default: https://api.proofmark.com)
      # @param timeout [Integer] HTTP timeout in seconds (default: 5)
      # @param http_transport [Proc, nil] Optional transport for testing: ->(uri, form_hash, timeout) { [status_int, body_string] }
      def initialize(secret:, base_url: DEFAULT_BASE_URL, timeout: DEFAULT_TIMEOUT, http_transport: nil)
        raise ArgumentError, "secret is required" if secret.nil? || secret.empty?

        @secret = secret
        @base_url = base_url.to_s.sub(/\/+$/, "")
        @timeout = timeout
        @http_transport = http_transport
      end

      # Verify a ProofMark Verify token
      # @param token [String] The pm-verify-response token
      # @param remoteip [String, nil] Optional end-user IP address
      # @return [Result] Verification result
      # @raise [Error] On network/timeout/HTTP/parse errors
      def verify(token, remoteip: nil)
        # Short-circuit if token is missing
        if token.nil? || token.empty?
          return Result.from_json(
            "success" => false,
            "score" => 0,
            "error-codes" => ["missing-input-response"]
          )
        end

        # Build form data
        form = { "secret" => @secret, "response" => token }
        form["remoteip"] = remoteip if remoteip && !remoteip.empty?

        # Call transport
        uri = URI.parse("#{@base_url}/v1/verify/siteverify")
        status, body = if @http_transport
                         @http_transport.call(uri, form, @timeout)
                       else
                         default_transport(uri, form, @timeout)
                       end

        # Check HTTP status
        if status >= 400
          raise Error.new("PMV_HTTP_ERROR", "siteverify returned HTTP #{status}")
        end

        # Parse JSON
        begin
          parsed = JSON.parse(body)
        rescue JSON::ParserError => e
          raise Error.new("PMV_INVALID_RESPONSE", "siteverify returned non-JSON body (status #{status}): #{e.message}")
        end

        Result.from_json(parsed)
      end

      private

      # Default Net::HTTP transport
      # @param uri [URI]
      # @param form [Hash]
      # @param timeout [Integer]
      # @return [Array<Integer, String>] [status, body]
      def default_transport(uri, form, timeout)
        Net::HTTP.start(
          uri.host,
          uri.port,
          use_ssl: uri.scheme == "https",
          open_timeout: timeout,
          read_timeout: timeout
        ) do |http|
          req = Net::HTTP::Post.new(uri)
          req.set_form_data(form)
          req["Content-Type"] = "application/x-www-form-urlencoded"
          res = http.request(req)
          return [res.code.to_i, res.body]
        end
      rescue Net::OpenTimeout, Net::ReadTimeout, Timeout::Error => e
        raise Error.new("PMV_TIMEOUT", "siteverify timed out after #{timeout}s: #{e.message}")
      rescue SocketError, SystemCallError, IOError, EOFError => e
        raise Error.new("PMV_NETWORK_ERROR", "siteverify network error: #{e.message}")
      end
    end
  end
end
