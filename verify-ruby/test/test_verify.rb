# frozen_string_literal: true

require "minitest/autorun"
require_relative "../lib/proofmark-verify"

class TestProofMarkVerify < Minitest::Test
  def setup
    @secret = "pmvs_test_secret_key"
  end

  # Test: empty token (no HTTP call)
  def test_empty_token_returns_error_without_http_call
    call_count = 0
    fake_transport = lambda do |_uri, _form, _timeout|
      call_count += 1
      [200, '{"success":true}']
    end

    client = ProofMark::Verify::Client.new(
      secret: @secret,
      http_transport: fake_transport
    )

    result = client.verify("")

    assert_equal false, result.success
    assert_equal 0.0, result.score
    assert_includes result.error_codes, "missing-input-response"
    assert_equal 0, call_count, "Transport should NOT be called for empty token"
  end

  # Test: nil token (no HTTP call)
  def test_nil_token_returns_error_without_http_call
    call_count = 0
    fake_transport = lambda do |_uri, _form, _timeout|
      call_count += 1
      [200, '{"success":true}']
    end

    client = ProofMark::Verify::Client.new(
      secret: @secret,
      http_transport: fake_transport
    )

    result = client.verify(nil)

    assert_equal false, result.success
    assert_equal 0.0, result.score
    assert_includes result.error_codes, "missing-input-response"
    assert_equal 0, call_count, "Transport should NOT be called for nil token"
  end

  # Test: successful verification with high score
  def test_successful_verification_high_score
    fake_transport = lambda do |_uri, _form, _timeout|
      [200, '{"success":true,"score":0.9,"flags":[],"credit":true,"challenge_ts":"2026-06-25T10:00:00Z","hostname":"example.com","action":"signup"}']
    end

    client = ProofMark::Verify::Client.new(
      secret: @secret,
      http_transport: fake_transport
    )

    result = client.verify("valid_token_xyz")

    assert_equal true, result.success
    assert_equal true, result.success? # alias
    assert_equal 0.9, result.score
    assert_equal [], result.flags
    assert_equal true, result.credit
    assert_equal "2026-06-25T10:00:00Z", result.challenge_ts
    assert_equal "example.com", result.hostname
    assert_equal "signup", result.action
    assert_equal true, result.human?(0.5)
  end

  # Test: successful verification with low score
  def test_successful_verification_low_score
    fake_transport = lambda do |_uri, _form, _timeout|
      [200, '{"success":true,"score":0.3,"flags":["fast_completion"],"credit":true}']
    end

    client = ProofMark::Verify::Client.new(
      secret: @secret,
      http_transport: fake_transport
    )

    result = client.verify("suspicious_token")

    assert_equal true, result.success
    assert_equal 0.3, result.score
    assert_equal ["fast_completion"], result.flags
    assert_equal false, result.human?(0.5), "Score 0.3 should not pass 0.5 threshold"
    assert_equal true, result.human?(0.2), "Score 0.3 should pass 0.2 threshold"
  end

  # Test: transport receives correct form data including remoteip
  def test_transport_receives_correct_form_data
    received_form = nil
    fake_transport = lambda do |_uri, form, _timeout|
      received_form = form
      [200, '{"success":true,"score":0.8,"flags":[],"credit":true}']
    end

    client = ProofMark::Verify::Client.new(
      secret: @secret,
      http_transport: fake_transport
    )

    client.verify("test_token", remoteip: "203.0.113.42")

    refute_nil received_form
    assert_equal @secret, received_form["secret"]
    assert_equal "test_token", received_form["response"]
    assert_equal "203.0.113.42", received_form["remoteip"]
  end

  # Test: transport does NOT receive remoteip if not provided
  def test_transport_no_remoteip_when_nil
    received_form = nil
    fake_transport = lambda do |_uri, form, _timeout|
      received_form = form
      [200, '{"success":true,"score":0.8,"flags":[],"credit":true}']
    end

    client = ProofMark::Verify::Client.new(
      secret: @secret,
      http_transport: fake_transport
    )

    client.verify("test_token")

    refute_nil received_form
    assert_equal @secret, received_form["secret"]
    assert_equal "test_token", received_form["response"]
    refute received_form.key?("remoteip"), "remoteip should not be in form when not provided"
  end

  # Test: HTTP 403 error
  def test_http_403_error
    fake_transport = lambda do |_uri, _form, _timeout|
      [403, '{"error":"invalid-secret"}']
    end

    client = ProofMark::Verify::Client.new(
      secret: @secret,
      http_transport: fake_transport
    )

    error = assert_raises(ProofMark::Verify::Error) do
      client.verify("test_token")
    end

    assert_equal "PMV_HTTP_ERROR", error.code
    assert_match(/HTTP 403/, error.message)
  end

  # Test: Invalid JSON response
  def test_invalid_json_response
    fake_transport = lambda do |_uri, _form, _timeout|
      [200, 'not valid JSON at all']
    end

    client = ProofMark::Verify::Client.new(
      secret: @secret,
      http_transport: fake_transport
    )

    error = assert_raises(ProofMark::Verify::Error) do
      client.verify("test_token")
    end

    assert_equal "PMV_INVALID_RESPONSE", error.code
    assert_match(/non-JSON/, error.message)
  end

  # Test: Constructor requires secret
  def test_constructor_requires_secret
    error = assert_raises(ArgumentError) do
      ProofMark::Verify::Client.new(secret: nil)
    end

    assert_match(/secret is required/, error.message)

    error = assert_raises(ArgumentError) do
      ProofMark::Verify::Client.new(secret: "")
    end

    assert_match(/secret is required/, error.message)
  end

  # Test: Result.from_json handles missing/malformed fields
  def test_result_from_json_defensive
    result = ProofMark::Verify::Result.from_json(nil)
    assert_equal false, result.success
    assert_equal 0.0, result.score

    result = ProofMark::Verify::Result.from_json({})
    assert_equal false, result.success
    assert_equal 0.0, result.score

    result = ProofMark::Verify::Result.from_json({ "success" => "yes", "score" => "high" })
    assert_equal false, result.success # "yes" != true
    assert_equal 0.0, result.score # "high" -> 0.0

    result = ProofMark::Verify::Result.from_json({ "success" => true, "score" => 0.7, "flags" => "not-an-array" })
    assert_equal true, result.success
    assert_equal 0.7, result.score
    assert_equal ["not-an-array"], result.flags # wrapped
  end

  # Test: Convenience constructor ProofMark::Verify.new
  def test_convenience_constructor
    fake_transport = lambda do |_uri, _form, _timeout|
      [200, '{"success":true,"score":0.8,"flags":[],"credit":true}']
    end

    client = ProofMark::Verify.new(
      secret: @secret,
      http_transport: fake_transport
    )

    assert_instance_of ProofMark::Verify::Client, client

    result = client.verify("test_token")
    assert_equal true, result.success
  end
end
