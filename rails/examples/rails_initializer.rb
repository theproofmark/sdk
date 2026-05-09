# frozen_string_literal: true

# config/initializers/showad.rb
#
# Drop this file into a Rails application after adding `gem
# 'proofmark-showad', require: 'showad'` to the Gemfile. The Railtie reads
# the values configured below and inserts `ShowAd::Middleware` into the
# Rails middleware stack automatically.

Rails.application.configure do
  config.showad.creator_hash    = ENV.fetch('SHOWAD_CREATOR_HASH', nil)
  config.showad.api_key         = ENV.fetch('SHOWAD_API_KEY', nil)
  config.showad.redirect_secret = ENV.fetch('SHOWAD_REDIRECT_SECRET', nil)

  # Optional overrides; safe defaults are provided by the SDK.
  config.showad.api_base_url    = ENV.fetch('SHOWAD_API_BASE_URL', 'https://ad.proofmark.io')
  config.showad.video_ad_url    = ENV.fetch('SHOWAD_VIDEO_AD_URL', 'https://showad.proofmark.io')

  config.showad.protected_paths = ['/premium/*', '/members/*']
  config.showad.excluded_paths  = ['/healthz', '/up', '/assets/*']

  # `before_protect` may return 'allow', 'continue', or a Hash with an
  # explicit `redirect_url`. UA matching alone never grants bypass.
  config.showad.access_policy = {
    trusted_ip_headers: ['CF-Connecting-IP', 'X-Forwarded-For'],
    allow_cidrs: %w[10.0.0.0/8 192.168.0.0/16],
    crawler: {
      enabled: true,
      allow_cloudflare_verified_bot: true,
      family_cidrs: {
        'google' => %w[66.249.64.0/19 66.249.79.0/24]
      }
    },
    before_protect: lambda do |_request, client_ip:, user_agent:|
      # Example: skip protection for already-authenticated app users.
      # next 'allow' if Current.user&.premium?
      'continue'
    end
  }

  config.showad.cookie_max_age  = 3600
  config.showad.cookie_same_site = 'Lax'
  config.showad.debug = Rails.env.development?
end
