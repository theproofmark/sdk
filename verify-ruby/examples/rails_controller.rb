# frozen_string_literal: true

# ============================================================================
# Plain Ruby Example (framework-free)
# ============================================================================
#
# require "proofmark-verify"
#
# client = ProofMark::Verify::Client.new(secret: ENV["PMV_SECRET_KEY"])
#
# # Assuming you got token from a web form POST
# token = params["pm-verify-response"]
# user_ip = request.remote_ip
#
# result = client.verify(token, remoteip: user_ip)
#
# if result.human?(0.5)
#   puts "Verified human! Score: #{result.score}"
#   # ... proceed with signup/action
# else
#   puts "Verification failed or low score"
#   # ... reject request
# end

# ============================================================================
# Rails Controller Example
# ============================================================================

require "proofmark-verify"

class SignupsController < ApplicationController
  # POST /signup
  def create
    # 1. Read token from form (ProofMark widget submits as pm-verify-response)
    token = params["pm-verify-response"]

    # 2. Initialize client (consider caching this in an initializer)
    client = ProofMark::Verify::Client.new(secret: ENV["PMV_SECRET_KEY"])

    # 3. Verify token with user's IP
    result = client.verify(token, remoteip: request.remote_ip)

    # 4. Check success + score threshold
    if result.human?(0.5)
      # Human verified! Proceed with signup
      user = User.create!(email: params[:email], ...)

      # Optional: log additional signals
      Rails.logger.info "ProofMark verification: score=#{result.score} flags=#{result.flags.join(',')}"

      redirect_to dashboard_path, notice: "Welcome!"
    else
      # Verification failed or score too low
      flash.now[:error] = "Please complete the verification challenge"
      render :new, status: :unprocessable_entity
    end
  rescue ProofMark::Verify::Error => e
    # Network/timeout error — decide policy: fail-closed (reject) or fail-open (allow)
    Rails.logger.error "ProofMark verification error: [#{e.code}] #{e.message}"

    # Fail-closed (recommended for high-security flows):
    flash.now[:error] = "Verification service unavailable. Please try again."
    render :new, status: :service_unavailable
  end
end

# ============================================================================
# Recommended Thresholds (from ProofMark docs)
# ============================================================================
#
# Use case                   | Recommended min_score
# ---------------------------|----------------------
# Newsletter signup          | 0.3
# Free trial signup          | 0.5
# Paid signup w/ card        | 0.6
# Forum post                 | 0.4
# Password reset             | 0.7
# Login (suspicious context) | 0.7
#
# Advanced: inspect result.flags for fine-grained decisions:
#   - "datacenter_ip" — traffic from known datacenter
#   - "vpn_suspected" — VPN/proxy indicators
#   - "fast_completion" — submitted faster than 90% of humans
#   - "low_diversity_session" — many recent challenges from this IP
#   - "no_challenge_shown" — fail-open token (no ad inventory)
#   - "replayed" — token already redeemed
