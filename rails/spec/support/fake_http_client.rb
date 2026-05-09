# frozen_string_literal: true

require 'json'

# Test double that mimics `ShowAd::HttpClient`. Each `#post` / `#get` call
# is recorded so specs can assert against headers/body, and queued responses
# (or a single canned response) drive the middleware deterministically.
class FakeHttpClient
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

  attr_accessor :calls

  def initialize
    @calls = []
    @responses = { post: [], get: [] }
  end

  def stub_post(status: 200, body: {}, headers: {})
    @responses[:post] << make_response(status, body, headers)
    self
  end

  def stub_get(status: 200, body: {}, headers: {})
    @responses[:get] << make_response(status, body, headers)
    self
  end

  def post(url, body: nil, headers: {})
    @calls << { method: :post, url: url, body: body, headers: headers }
    next_response(:post)
  end

  def get(url, headers: {})
    @calls << { method: :get, url: url, headers: headers }
    next_response(:get)
  end

  private

  def next_response(method)
    queue = @responses[method]
    raise "FakeHttpClient: no stubbed #{method} response" if queue.empty?

    queue.length > 1 ? queue.shift : queue.first
  end

  def make_response(status, body, headers)
    serialized = body.is_a?(String) ? body : JSON.generate(body)
    Response.new(status: status, body: serialized, headers: headers)
  end
end
