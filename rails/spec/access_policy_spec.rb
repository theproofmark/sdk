# frozen_string_literal: true

require 'spec_helper'

RSpec.describe ShowAd::AccessPolicy do
  subject(:policy) { described_class.new }

  def request(headers: {}, ip: '203.0.113.5', user_agent: 'curl/8.0', path: '/x', url: 'http://e.test/x')
    {
      headers: { 'User-Agent' => user_agent }.merge(headers),
      ip: ip,
      user_agent: user_agent,
      path: path,
      url: url
    }
  end

  describe 'returning continue' do
    it 'is the default with no policy options' do
      expect(policy.evaluate(request, nil)[:action]).to eq('continue')
      expect(policy.evaluate(request, {})[:action]).to eq('continue')
    end

    it 'is the result when no rule matches' do
      result = policy.evaluate(request, allow_cidrs: ['10.0.0.0/8'])
      expect(result[:action]).to eq('continue')
    end
  end

  describe 'CIDR allowlist' do
    it 'allows IPv4 address inside the configured CIDR' do
      result = policy.evaluate(request(ip: '10.0.0.42'), allow_cidrs: ['10.0.0.0/8'])
      expect(result).to include(action: 'allow', reason: 'cidr_allowlist')
    end

    it 'does not allow IPv4 address outside the configured CIDR' do
      result = policy.evaluate(request(ip: '11.0.0.1'), allow_cidrs: ['10.0.0.0/8'])
      expect(result[:action]).to eq('continue')
    end

    it 'supports IPv6 CIDR matches' do
      result = policy.evaluate(request(ip: '2001:db8::1'), allow_cidrs: ['2001:db8::/32'])
      expect(result[:action]).to eq('allow')
    end

    it 'resolves the client IP from the configured trusted header' do
      req = request(headers: { 'X-Forwarded-For' => '10.0.0.42, 99.99.99.99' }, ip: '127.0.0.1')
      result = policy.evaluate(req,
                               trusted_ip_headers: ['X-Forwarded-For'],
                               allow_cidrs: ['10.0.0.0/8'])
      expect(result[:action]).to eq('allow')
    end

    it 'ignores invalid CIDR strings without crashing' do
      result = policy.evaluate(request(ip: '10.0.0.1'), allow_cidrs: ['not-a-cidr'])
      expect(result[:action]).to eq('continue')
    end
  end

  describe 'crawler verification' do
    it 'never grants bypass on UA alone' do
      req = request(user_agent: 'Mozilla/5.0 (compatible; Googlebot/2.1)')
      result = policy.evaluate(req, crawler: { enabled: true })
      expect(result[:action]).to eq('continue')
    end

    it 'allows when UA family matches and IP falls in family CIDRs' do
      req = request(user_agent: 'Googlebot/2.1', ip: '66.249.66.1')
      result = policy.evaluate(req, crawler: {
                                 enabled: true,
                                 family_cidrs: { 'google' => ['66.249.0.0/16'] }
                               })
      expect(result).to include(action: 'allow', reason: 'crawler:google')
    end

    it 'allows when Cloudflare verified-bot header is set and the option is on' do
      req = request(headers: { 'CF-Verified-Bot' => 'true' }, user_agent: 'Googlebot/2.1', ip: '1.2.3.4')
      result = policy.evaluate(req, crawler: { enabled: true, allow_cloudflare_verified_bot: true })
      expect(result[:action]).to eq('allow')
    end

    it 'consults the reverse_dns_verifier callable as a last resort' do
      verifier = ->(_ip, family) { family == 'bing' }
      req = request(user_agent: 'bingbot', ip: '1.2.3.4')
      result = policy.evaluate(req, crawler: { enabled: true, reverse_dns_verifier: verifier })
      expect(result).to include(action: 'allow', reason: 'crawler:bing')
    end

    it 'returns continue when crawler verification is disabled' do
      req = request(user_agent: 'Googlebot/2.1', ip: '66.249.66.1')
      result = policy.evaluate(req, crawler: { enabled: false })
      expect(result[:action]).to eq('continue')
    end
  end

  describe 'before_protect callback' do
    it 'lets the publisher allow the request' do
      callback = ->(_req, **_kwargs) { 'allow' }
      result = policy.evaluate(request, before_protect: callback)
      expect(result[:action]).to eq('allow')
    end

    it 'lets the publisher redirect with a custom URL' do
      callback = ->(_req, **_kwargs) { { action: 'redirect', redirect_url: 'https://example.com/login' } }
      result = policy.evaluate(request, before_protect: callback)
      expect(result).to include(action: 'redirect', redirect_url: 'https://example.com/login')
    end

    it 'normalizes nil and unknown returns to continue' do
      result = policy.evaluate(request, before_protect: ->(_req, **_kwargs) { nil })
      expect(result[:action]).to eq('continue')
    end
  end
end
