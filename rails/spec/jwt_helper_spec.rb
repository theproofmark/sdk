# frozen_string_literal: true

require 'spec_helper'

RSpec.describe ShowAd::JwtHelper do
  let(:future) { Time.now.to_i + 3600 }
  let(:past)   { Time.now.to_i - 3600 }

  describe '.decode_token' do
    it 'returns the parsed claims for a valid 3-part token' do
      token = make_token('creator_hash' => 'crh_1', 'exp' => future)
      expect(described_class.decode_token(token)).to include('creator_hash' => 'crh_1')
    end

    it 'returns nil for nil or empty input' do
      expect(described_class.decode_token(nil)).to be_nil
      expect(described_class.decode_token('')).to be_nil
    end

    it 'returns nil for a malformed token' do
      expect(described_class.decode_token('not.a.token.really')).to be_nil
      expect(described_class.decode_token('abc.def')).to be_nil
    end

    it 'returns nil for non-JSON payload' do
      header = Base64.urlsafe_encode64('{}').delete('=')
      payload = Base64.urlsafe_encode64('not-json').delete('=')
      expect(described_class.decode_token("#{header}.#{payload}.sig")).to be_nil
    end
  end

  describe '.token_expired?' do
    it 'returns true for expired exp' do
      expect(described_class.token_expired?(make_token('exp' => past))).to be true
    end

    it 'returns false for future exp with no nbf in the future' do
      expect(described_class.token_expired?(make_token('exp' => future))).to be false
    end

    it 'returns true when nbf is in the future' do
      expect(described_class.token_expired?(make_token('exp' => future, 'nbf' => future))).to be true
    end

    it 'returns true for malformed tokens' do
      expect(described_class.token_expired?('garbage')).to be true
    end
  end

  describe '.token_expiry' do
    it 'returns expiry in milliseconds' do
      token = make_token('exp' => future)
      expect(described_class.token_expiry(token)).to eq(future * 1000)
    end

    it 'returns nil when no exp claim is present' do
      expect(described_class.token_expiry(make_token({}))).to be_nil
    end
  end

  describe '.validate_token_claims' do
    let(:claims) do
      {
        'creator_hash' => 'crh_1',
        'fingerprint' => 'fp_1',
        'iss' => 'showad-backend',
        'exp' => future
      }
    end

    it 'accepts a fully valid token' do
      result = described_class.validate_token_claims(make_token(claims), 'crh_1', 'fp_1')
      expect(result).to eq(valid: true, reason: nil)
    end

    it 'rejects mismatched creator hash' do
      result = described_class.validate_token_claims(make_token(claims), 'other', 'fp_1')
      expect(result[:valid]).to be false
      expect(result[:reason]).to match(/Creator hash/)
    end

    it 'rejects mismatched fingerprint when one is provided' do
      result = described_class.validate_token_claims(make_token(claims), 'crh_1', 'fp_other')
      expect(result[:valid]).to be false
      expect(result[:reason]).to match(/Fingerprint/)
    end

    it 'skips fingerprint check when no fingerprint is provided' do
      result = described_class.validate_token_claims(make_token(claims), 'crh_1', nil)
      expect(result[:valid]).to be true
    end

    it 'rejects unknown issuer' do
      bad = claims.merge('iss' => 'evil-issuer')
      result = described_class.validate_token_claims(make_token(bad), 'crh_1', 'fp_1')
      expect(result[:valid]).to be false
      expect(result[:reason]).to match(/issuer/i)
    end

    it 'rejects expired tokens' do
      expired = claims.merge('exp' => past)
      result = described_class.validate_token_claims(make_token(expired), 'crh_1', 'fp_1')
      expect(result[:valid]).to be false
      expect(result[:reason]).to match(/expired/i)
    end
  end
end
