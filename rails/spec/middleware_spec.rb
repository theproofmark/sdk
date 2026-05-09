# frozen_string_literal: true

require 'spec_helper'

RSpec.describe ShowAd::Middleware do
  let(:future) { Time.now.to_i + 3600 }
  let(:past)   { Time.now.to_i - 3600 }
  let(:creator_hash) { 'crh_test' }
  let(:downstream) do
    ->(_env) { [200, { 'content-type' => 'text/plain' }, ['ok']] }
  end
  let(:fake_http) { FakeHttpClient.new }
  let(:config) do
    ShowAd::Config.new(
      creator_hash: creator_hash,
      api_key: 'sdk_key',
      redirect_secret: 'secret',
      protected_paths: ['/premium/*'],
      excluded_paths: ['/healthz'],
      http_client: fake_http,
      cookie_secure: false
    )
  end
  let(:app) { described_class.new(downstream, config) }
  let(:request) { Rack::MockRequest.new(app) }

  def cookie_header(pairs)
    pairs.map { |k, v| "#{k}=#{v}" }.join('; ')
  end

  def parse_set_cookies(headers)
    raw = headers['set-cookie'] || headers['Set-Cookie']
    return [] if raw.nil?

    raw.is_a?(Array) ? raw : raw.split("\n")
  end

  describe 'path gating' do
    it 'passes through excluded paths' do
      response = request.get('/healthz')
      expect(response.status).to eq(200)
      expect(response.body).to eq('ok')
    end

    it 'passes through paths outside protected_paths' do
      response = request.get('/public')
      expect(response.status).to eq(200)
    end
  end

  describe 'with no token and no ticket' do
    it 'redirects to the video ad' do
      response = request.get('/premium/article')
      expect(response.status).to eq(302)
      expect(response.headers['location']).to start_with("https://showad.proofmark.io/c/#{creator_hash}")
      expect(response.headers['location']).to include('return_url=')
      expect(response.headers['location']).to include('sdk=1')
    end

    it 'clears stale verification cookies on the redirect' do
      response = request.get(
        '/premium/article',
        'HTTP_COOKIE' => cookie_header('showad_token' => 'stale', 'showad_verified' => '1')
      )
      cookies = parse_set_cookies(response.headers)
      expect(cookies.any? { |c| c.start_with?('showad_token=') && c.include?('max-age=0') }).to be true
    end
  end

  describe 'with a valid token cookie' do
    let(:token) do
      make_token('creator_hash' => creator_hash, 'fingerprint' => 'fp_1', 'iss' => 'showad-backend', 'exp' => future)
    end

    it 'calls the downstream app' do
      fake_http.stub_post(status: 200, body: { 'valid' => true, 'message' => 'ok', 'creator_hash' => creator_hash })

      response = request.get(
        '/premium/article',
        'HTTP_COOKIE' => cookie_header(
          'showad_token' => token,
          'showad_fingerprint' => 'fp_1',
          'showad_creator' => creator_hash,
          'showad_verified' => '1',
          'showad_expires' => (future * 1000).to_s
        )
      )
      expect(response.status).to eq(200)
      expect(response.body).to eq('ok')
      validate_call = fake_http.calls.last
      expect(validate_call[:url]).to include('/api/sdk/validate')
      expect(validate_call[:body]).to eq(token: token, sdk_key: 'sdk_key')
    end

    it 'refreshes verification cookies when metadata is stale' do
      fake_http.stub_post(status: 200, body: { 'valid' => true, 'message' => 'ok', 'creator_hash' => creator_hash })

      response = request.get(
        '/premium/article',
        'HTTP_COOKIE' => cookie_header(
          'showad_token' => token,
          'showad_fingerprint' => 'fp_1'
        )
      )
      expect(response.status).to eq(200)
      cookies = parse_set_cookies(response.headers)
      expect(cookies.any? { |c| c.start_with?("showad_creator=#{creator_hash}") }).to be true
      expect(cookies.any? { |c| c.start_with?('showad_verified=1') }).to be true
    end

    it 'redirects when a forged token has matching local claims but backend rejects it' do
      fake_http.stub_post(status: 200, body: { 'valid' => false, 'message' => 'forged' })

      response = request.get(
        '/premium/article',
        'HTTP_COOKIE' => cookie_header(
          'showad_token' => token,
          'showad_fingerprint' => 'fp_1',
          'showad_creator' => creator_hash,
          'showad_verified' => '1',
          'showad_expires' => (future * 1000).to_s
        )
      )

      expect(response.status).to eq(302)
      expect(response.headers['location']).to start_with("https://showad.proofmark.io/c/#{creator_hash}")
      cookies = parse_set_cookies(response.headers)
      expect(cookies.any? { |c| c.start_with?('showad_token=') && c.include?('max-age=0') }).to be true
    end

    it 'redirects to the video ad when the fingerprint cookie does not match the token' do
      response = request.get(
        '/premium/article',
        'HTTP_COOKIE' => cookie_header('showad_token' => token, 'showad_fingerprint' => 'fp_other')
      )
      expect(response.status).to eq(302)
    end
  end

  describe 'with an expired token cookie' do
    it 'redirects to the video ad' do
      expired = make_token('creator_hash' => creator_hash, 'exp' => past)
      response = request.get(
        '/premium/article',
        'HTTP_COOKIE' => cookie_header('showad_token' => expired, 'showad_fingerprint' => 'fp_1')
      )
      expect(response.status).to eq(302)
    end
  end

  describe 'with a redirect_ticket query param' do
    let(:claim_token) do
      make_token('creator_hash' => creator_hash, 'fingerprint' => 'fp_1', 'iss' => 'showad-backend', 'exp' => future)
    end

    it 'claims the ticket, sets cookies, and 302s to the clean URL' do
      fake_http.stub_post(
        status: 200,
        body: { 'token' => claim_token, 'creator_hash' => creator_hash, 'ticket_id' => 'tkt_1' }
      )

      response = request.get(
        '/premium/article?redirect_ticket=tkt_1&utm=foo',
        'HTTP_COOKIE' => cookie_header('showad_fingerprint' => 'fp_1')
      )

      expect(response.status).to eq(302)
      expect(response.headers['location']).not_to include('redirect_ticket')
      expect(response.headers['location']).to include('utm=foo')

      claim_call = fake_http.calls.first
      expect(claim_call[:url]).to include('/api/redirect-ticket/tkt_1/claim')
      expect(claim_call[:headers]['X-Redirect-Ticket-Secret']).to eq('secret')
      expect(claim_call[:headers]['X-ShowAd-API-Key']).to eq('sdk_key')
      expect(claim_call[:headers]['X-ShowAd-Creator-Hash']).to eq(creator_hash)

      cookies = parse_set_cookies(response.headers)
      expect(cookies.any? { |c| c.start_with?('showad_token=') && c.include?('httponly') }).to be true
      expect(cookies.any? { |c| c.start_with?('showad_verified=1') }).to be true
    end

    it 'falls back to redirecting to the video ad when the claim fails (410)' do
      fake_http.stub_post(status: 410, body: { 'error' => 'gone' })

      response = request.get(
        '/premium/article?redirect_ticket=tkt_1',
        'HTTP_COOKIE' => cookie_header('showad_fingerprint' => 'fp_1')
      )
      expect(response.status).to eq(302)
      expect(response.headers['location']).to start_with('https://showad.proofmark.io/c/')
    end

    it 'redirects to the video ad when no fingerprint cookie is present' do
      response = request.get('/premium/article?redirect_ticket=tkt_1')
      expect(response.status).to eq(302)
      expect(response.headers['location']).to start_with('https://showad.proofmark.io/c/')
      expect(fake_http.calls).to be_empty
    end
  end

  describe 'access policy' do
    it 'allows when CIDR allowlist matches' do
      cfg = config.with(access_policy: { trusted_ip_headers: ['X-Forwarded-For'], allow_cidrs: ['10.0.0.0/8'] })
      app = described_class.new(downstream, cfg)
      response = Rack::MockRequest.new(app).get(
        '/premium/article',
        'HTTP_X_FORWARDED_FOR' => '10.1.2.3'
      )
      expect(response.status).to eq(200)
    end

    it 'does not allow on UA alone' do
      cfg = config.with(access_policy: { crawler: { enabled: true } })
      app = described_class.new(downstream, cfg)
      response = Rack::MockRequest.new(app).get(
        '/premium/article',
        'HTTP_USER_AGENT' => 'Mozilla/5.0 (compatible; Googlebot/2.1)'
      )
      expect(response.status).to eq(302)
    end
  end
end
