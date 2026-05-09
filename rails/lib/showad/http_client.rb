# frozen_string_literal: true

require 'net/http'
require 'uri'
require 'json'

module ShowAd
  # Default HTTP transport used by `ShowAd::Api`. Wraps `Net::HTTP` with sane
  # timeouts, JSON encoding/decoding, and a small response object that hides
  # the difference between `Net::HTTPResponse` subclasses.
  #
  # Replace it with any duck-typed object that implements `#post(url, body:,
  # headers:)` and `#get(url, headers: {})` returning a `Response`-like
  # struct. The test suite ships a `FakeHttpClient` that does exactly this.
  class HttpClient
    DEFAULT_OPEN_TIMEOUT = 5
    DEFAULT_READ_TIMEOUT = 10

    Response = Struct.new(:status, :body, :headers, keyword_init: true) do
      def ok?
        status.between?(200, 299)
      end

      def json
        return nil if body.nil? || body.empty?

        JSON.parse(body)
      rescue JSON::ParserError
        nil
      end
    end

    def initialize(open_timeout: DEFAULT_OPEN_TIMEOUT, read_timeout: DEFAULT_READ_TIMEOUT)
      @open_timeout = open_timeout
      @read_timeout = read_timeout
    end

    def post(url, body: nil, headers: {})
      request(url, Net::HTTP::Post, body: body, headers: headers)
    end

    def get(url, headers: {})
      request(url, Net::HTTP::Get, body: nil, headers: headers)
    end

    private

    def request(url, klass, body:, headers:)
      uri = URI.parse(url.to_s)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == 'https')
      http.open_timeout = @open_timeout
      http.read_timeout = @read_timeout

      request = klass.new(uri.request_uri)
      headers.each { |k, v| request[k.to_s] = v.to_s }
      request['Content-Type'] ||= 'application/json' if body
      request.body = body.is_a?(String) ? body : JSON.generate(body) if body

      response = http.request(request)
      Response.new(
        status: response.code.to_i,
        body: response.body.to_s,
        headers: response.each_header.to_h
      )
    rescue StandardError => e
      raise NetworkError.new("HTTP request failed: #{e.message}", context: { url: url, cause: e.class.name })
    end
  end
end
