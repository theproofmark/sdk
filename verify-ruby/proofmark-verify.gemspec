# frozen_string_literal: true

require_relative "../lib/proofmark/verify/version"

Gem::Specification.new do |spec|
  spec.name = "proofmark-verify"
  spec.version = ProofMark::Verify::VERSION
  spec.authors = ["ProofMark"]
  spec.summary = "ProofMark Verify — Ruby SDK for the CAPTCHA-replacement protocol (server-side token verification)"
  spec.description = "Server-side token verification for ProofMark Verify. Drop-in alternative to reCAPTCHA/hCaptcha/Turnstile server libraries."
  spec.homepage = "https://proofmark.com/verify"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 2.6"
  spec.files = Dir["lib/**/*.rb", "README.md"]
  spec.require_paths = ["lib"]
  spec.metadata = { "rubygems_mfa_required" => "false" }
end
