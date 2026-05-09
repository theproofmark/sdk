# frozen_string_literal: true

module ShowAd
  # Immutable configuration object for the SDK. Values are validated lazily —
  # `creator_hash`, `api_key`, and `redirect_secret` are only required for
  # operations that need them, so a misconfigured app fails near the call
  # site instead of at boot.
  #
  # All keyword args are optional except `creator_hash`, `api_key`, and
  # `redirect_secret`. Frozen after construction; create a new instance with
  # `#with` to override values in tests.
  class Config
    DEFAULT_API_BASE_URL  = 'https://ad.proofmark.io'
    DEFAULT_VIDEO_AD_URL  = 'https://showad.proofmark.io'
    DEFAULT_COOKIE_PREFIX = 'showad'
    DEFAULT_COOKIE_MAX_AGE = 3600

    ATTRS = %i[
      creator_hash
      api_key
      redirect_secret
      api_base_url
      video_ad_url
      cookie_prefix
      cookie_max_age
      cookie_secure
      cookie_same_site
      protected_paths
      excluded_paths
      access_policy
      http_client
      logger
      debug
    ].freeze

    attr_reader(*ATTRS)

    def initialize(
      creator_hash: nil,
      api_key: nil,
      redirect_secret: nil,
      api_base_url: DEFAULT_API_BASE_URL,
      video_ad_url: DEFAULT_VIDEO_AD_URL,
      cookie_prefix: DEFAULT_COOKIE_PREFIX,
      cookie_max_age: DEFAULT_COOKIE_MAX_AGE,
      cookie_secure: nil,
      cookie_same_site: 'Lax',
      protected_paths: [],
      excluded_paths: [],
      access_policy: nil,
      http_client: nil,
      logger: nil,
      debug: false
    )
      @creator_hash    = freeze_if_string(creator_hash)
      @api_key         = freeze_if_string(api_key)
      @redirect_secret = freeze_if_string(redirect_secret)
      @api_base_url    = freeze_if_string(api_base_url)
      @video_ad_url    = freeze_if_string(video_ad_url)
      @cookie_prefix   = freeze_if_string(cookie_prefix)
      @cookie_max_age  = Integer(cookie_max_age)
      @cookie_secure   = cookie_secure
      @cookie_same_site = freeze_if_string(cookie_same_site)
      @protected_paths = Array(protected_paths).map(&:to_s).freeze
      @excluded_paths  = Array(excluded_paths).map(&:to_s).freeze
      @access_policy   = access_policy.is_a?(Hash) ? deep_freeze(access_policy.dup) : access_policy
      @http_client     = http_client
      @logger          = logger
      @debug           = debug ? true : false

      freeze
    end

    # @param suffix [String] one of `ShowAd::Cookies::*`
    # @return [String] e.g. "showad_token"
    def cookie_name(suffix)
      "#{cookie_prefix}_#{suffix}"
    end

    # Materialize the secure-cookie flag. When unset, infer from the request's
    # scheme so that non-HTTPS dev environments still work but production
    # cookies are flagged Secure automatically.
    def cookie_secure?(env)
      return cookie_secure if cookie_secure == true || cookie_secure == false

      scheme = env['HTTPS'] || env['rack.url_scheme']
      scheme.to_s == 'https' || scheme.to_s == 'on'
    end

    # Build a new Config with selected values overridden. Useful in tests and
    # for per-request overrides without mutating the shared instance.
    def with(**overrides)
      attrs = ATTRS.each_with_object({}) { |k, h| h[k] = public_send(k) }
      Config.new(**attrs.merge(overrides))
    end

    # @raise [ConfigError] if any of `keys` is missing or blank.
    def require!(*keys)
      missing = keys.flatten.reject do |k|
        v = public_send(k)
        v.is_a?(String) ? !v.empty? : !v.nil?
      end
      return if missing.empty?

      raise ConfigError.new(
        "Missing required ShowAd configuration: #{missing.join(', ')}",
        context: { keys: missing }
      )
    end

    private

    def freeze_if_string(value)
      value.is_a?(String) ? value.dup.freeze : value
    end

    def deep_freeze(obj)
      case obj
      when Hash
        obj.each_value { |v| deep_freeze(v) }
        obj.freeze
      when Array
        obj.each { |v| deep_freeze(v) }
        obj.freeze
      else
        obj
      end
    end
  end
end
