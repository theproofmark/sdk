# frozen_string_literal: true

require 'ipaddr'

module ShowAd
  # Server-only access policy that runs **before** ShowAd verification.
  #
  # Pipeline (in order):
  #   1. Verified crawler (UA + trusted IP range OR Cloudflare verified bot)
  #   2. CIDR allowlist resolved from a trusted IP header
  #   3. Publisher-defined `before_protect` callable (premium users, app
  #      sessions, ...)
  #
  # The class is framework-free: it accepts a normalized request shape so
  # the same evaluator works under Rack, Rails, Sinatra, or any other host.
  #
  # UA matching alone NEVER grants bypass — it only narrows which IP/rDNS
  # rules to apply.
  class AccessPolicy
    DEFAULT_CRAWLER_USER_AGENTS = {
      'google'      => %w[googlebot google-inspectiontool apis-google].freeze,
      'bing'        => %w[bingbot].freeze,
      'duckduckgo'  => %w[duckduckbot].freeze,
      'yandex'      => %w[yandexbot].freeze,
      'baidu'       => %w[baiduspider].freeze,
      'openai'      => %w[gptbot chatgpt-user oai-searchbot].freeze,
      'anthropic'   => %w[claudebot anthropic-ai].freeze,
      'perplexity'  => %w[perplexitybot].freeze,
      'commoncrawl' => %w[ccbot].freeze,
      'facebook'    => %w[facebookexternalhit facebot].freeze,
      'twitter'     => %w[twitterbot].freeze,
      'linkedin'    => %w[linkedinbot].freeze
    }.freeze

    BOOLEAN_TRUE_VALUES = %w[1 true yes on].freeze

    # Normalized request shape:
    #   { headers: { String => String }, ip: String|nil, user_agent: String,
    #     path: String, url: String }
    #
    # @param request [Hash] normalized request
    # @param options [Hash, nil] policy options (see README)
    # @return [Hash] `{ action: 'allow'|'redirect'|'continue', reason: String,
    #   redirect_url: String|nil }`
    def evaluate(request, options)
      return { action: 'continue', reason: 'no_policy' } if options.nil? || options.empty?

      request = normalize_request(request)

      client_ip  = resolve_client_ip(request, options[:trusted_ip_headers] || options['trusted_ip_headers'] || [])
      user_agent = request[:user_agent].to_s

      crawler = verify_crawler(client_ip, user_agent, options[:crawler] || options['crawler'] || {}, request)
      return { action: 'allow', reason: "crawler:#{crawler[:family] || 'unknown'}" } if crawler[:verified]

      allow_cidrs = options[:allow_cidrs] || options['allow_cidrs'] || []
      if client_ip && ip_in_cidrs?(client_ip, allow_cidrs)
        return { action: 'allow', reason: 'cidr_allowlist' }
      end

      callback = options[:before_protect] || options['before_protect']
      if callback.respond_to?(:call)
        decision = callback.call(request, client_ip: client_ip, user_agent: user_agent)
        return normalize_decision(decision)
      end

      { action: 'continue', reason: 'no_match' }
    end

    # Resolve the client IP from configured trusted headers, falling back to
    # the request-supplied IP. Only the first comma-separated value is taken
    # because intermediate proxies append themselves on the right.
    def resolve_client_ip(request, trusted_headers)
      Array(trusted_headers).each do |header|
        value = lookup_header(request[:headers], header)
        next if value.nil? || value.empty?

        first = value.split(',').first.to_s.strip
        return first unless first.empty?
      end

      ip = request[:ip].to_s
      ip.empty? ? nil : ip
    end

    # @return [Hash] `{ verified: Boolean, reason: String, family: String|nil }`
    def verify_crawler(ip, user_agent, crawler_config, request = nil)
      return { verified: false, reason: 'disabled', family: nil } unless truthy?(crawler_config[:enabled] || crawler_config['enabled'])

      families     = crawler_config[:families]      || crawler_config['families']      || DEFAULT_CRAWLER_USER_AGENTS.keys
      ua_map       = crawler_config[:user_agents]   || crawler_config['user_agents']   || DEFAULT_CRAWLER_USER_AGENTS
      family       = match_crawler_family(user_agent, families, ua_map)
      return { verified: false, reason: 'no_family_match', family: nil } if family.nil?

      return { verified: false, reason: 'missing_ip', family: family } if ip.nil? || ip.empty?

      if truthy?(crawler_config[:allow_cloudflare_verified_bot] || crawler_config['allow_cloudflare_verified_bot']) && request
        cf_value = lookup_header(request[:headers], 'CF-Verified-Bot') ||
                   lookup_header(request[:headers], 'X-ProofMark-CF-Verified-Bot')
        if BOOLEAN_TRUE_VALUES.include?(cf_value.to_s.downcase)
          return { verified: true, reason: 'cloudflare_verified_bot', family: family }
        end
      end

      family_cidrs = (crawler_config[:family_cidrs] || crawler_config['family_cidrs'] || {})[family] ||
                     (crawler_config[:family_cidrs] || crawler_config['family_cidrs'] || {})[family.to_sym] || []
      return { verified: true, reason: 'cidr_match', family: family } if ip_in_cidrs?(ip, family_cidrs)

      verifier = crawler_config[:reverse_dns_verifier] || crawler_config['reverse_dns_verifier']
      if verifier.respond_to?(:call) && verifier.call(ip, family)
        return { verified: true, reason: 'reverse_dns_match', family: family }
      end

      { verified: false, reason: 'ip_not_verified', family: family }
    end

    # @return [Boolean]
    def ip_in_cidrs?(ip, cidrs)
      return false if ip.nil? || ip.empty?

      Array(cidrs).any? do |cidr|
        begin
          IPAddr.new(cidr.to_s).include?(ip)
        rescue IPAddr::Error
          false
        end
      end
    end

    private

    def match_crawler_family(user_agent, families, ua_map)
      return nil if user_agent.nil? || user_agent.empty?

      needle = user_agent.downcase
      Array(families).each do |family|
        family_str = family.to_s
        fragments = ua_map[family_str] || ua_map[family_str.to_sym] || []
        fragments.each do |fragment|
          fragment_str = fragment.to_s
          next if fragment_str.empty?

          return family_str if needle.include?(fragment_str.downcase)
        end
      end

      nil
    end

    def normalize_decision(decision)
      case decision
      when nil then { action: 'continue' }
      when String, Symbol then { action: decision.to_s }
      when Hash
        action = decision[:action] || decision['action'] || 'continue'
        result = { action: action.to_s }
        reason = decision[:reason] || decision['reason']
        redirect = decision[:redirect_url] || decision['redirect_url']
        result[:reason] = reason if reason
        result[:redirect_url] = redirect if redirect
        result
      else
        { action: 'continue' }
      end
    end

    def normalize_request(request)
      headers = request[:headers] || request['headers'] || {}
      headers = headers.each_with_object({}) { |(k, v), h| h[k.to_s] = v.to_s }
      {
        headers: headers,
        ip: request[:ip] || request['ip'],
        user_agent: request[:user_agent] || request['user_agent'] || headers['User-Agent'] || headers['user-agent'] || '',
        path: request[:path] || request['path'] || '/',
        url:  request[:url]  || request['url']  || ''
      }
    end

    def lookup_header(headers, name)
      return nil if headers.nil?

      target = name.to_s.downcase
      headers.each do |k, v|
        return v.to_s if k.to_s.downcase == target
      end
      nil
    end

    def truthy?(value)
      value == true || (value.is_a?(String) && BOOLEAN_TRUE_VALUES.include?(value.downcase))
    end
  end
end
