# frozen_string_literal: true

require 'rack'
require 'rack/request'
require 'rack/response'

module ShowAd
  # Rack middleware that gates downstream apps behind ShowAd verification.
  #
  # Order of decisions (matches Laravel and Next.js SDKs):
  #   1. Path excluded → call next app.
  #   2. Path not in `protected_paths` (when configured) → call next app.
  #   3. Access policy → may short-circuit with allow / redirect.
  #   4. `?redirect_ticket=` present → claim, set cookies, 302 to clean URL.
  #   5. Token cookie valid → call next app, refresh cookies if metadata
  #      drifted.
  #   6. Else → 302 to the video-ad page.
  #
  # The middleware is framework-free; the `Railtie` plugs it into Rails for
  # convenience.
  class Middleware
    def initialize(app, config_or_hash = nil, **kwargs)
      @app = app
      @config = build_config(config_or_hash, kwargs)
      @api = Api.new(@config)
      @access_policy = AccessPolicy.new
    end

    def call(env)
      request = Rack::Request.new(env)
      path = request.path_info.to_s

      return @app.call(env) if PathMatch.matches_any?(path, @config.excluded_paths)

      unless @config.protected_paths.empty? || PathMatch.matches_any?(path, @config.protected_paths)
        return @app.call(env)
      end

      debug("Processing protected path: #{path}")

      decision = evaluate_access_policy(request)
      case decision[:action]
      when 'allow'
        debug("Access policy bypass: #{decision[:reason]}")
        return @app.call(env)
      when 'redirect'
        debug("Access policy redirect: #{decision[:reason]}")
        target = decision[:redirect_url] || build_video_ad_url(request)
        return redirect_response(target, request, clear_cookies: false)
      end

      cookies = read_cookies(request)
      ticket  = request.params['redirect_ticket']

      return handle_redirect_ticket(request, ticket, cookies) if ticket && !ticket.empty?

      return handle_existing_token(env, request, cookies) if cookies[:token] && !cookies[:token].empty?

      debug('No verification found - redirecting to video ad')
      redirect_response(build_video_ad_url(request), request, clear_cookies: true)
    end

    private

    def build_config(config_or_hash, kwargs)
      return config_or_hash if config_or_hash.is_a?(Config)

      attrs = config_or_hash.is_a?(Hash) ? symbolize(config_or_hash) : {}
      Config.new(**attrs.merge(kwargs))
    end

    def symbolize(hash)
      hash.each_with_object({}) { |(k, v), out| out[k.to_sym] = v }
    end

    def evaluate_access_policy(request)
      return { action: 'continue' } if @config.access_policy.nil? || @config.access_policy.empty?

      @access_policy.evaluate(
        {
          headers: extract_headers(request.env),
          ip: request.ip,
          user_agent: request.user_agent.to_s,
          path: request.path_info,
          url: request.url
        },
        @config.access_policy
      )
    end

    def extract_headers(env)
      env.each_with_object({}) do |(k, v), h|
        next unless k.is_a?(String)

        if k.start_with?('HTTP_')
          h[k.sub(/^HTTP_/, '').tr('_', '-')] = v.to_s
        elsif %w[CONTENT_TYPE CONTENT_LENGTH].include?(k)
          h[k.tr('_', '-')] = v.to_s
        end
      end
    end

    def read_cookies(request)
      {
        fingerprint: request.cookies[@config.cookie_name(Cookies::FINGERPRINT)],
        token:       request.cookies[@config.cookie_name(Cookies::TOKEN)],
        creator:     request.cookies[@config.cookie_name(Cookies::CREATOR)],
        verified:    request.cookies[@config.cookie_name(Cookies::VERIFIED)],
        expires:     request.cookies[@config.cookie_name(Cookies::EXPIRES)],
        ticket:      request.cookies[@config.cookie_name(Cookies::TICKET)]
      }
    end

    def handle_redirect_ticket(request, ticket_id, cookies)
      debug("Found redirect ticket: #{ticket_id}")

      if cookies[:fingerprint].nil? || cookies[:fingerprint].empty?
        debug('No fingerprint cookie present - cannot validate; redirecting to video ad')
        return redirect_response(build_video_ad_url(request), request, clear_cookies: true)
      end

      claim = @api.claim_redirect_ticket(ticket_id)
      clean_url = Url.remove_query_param(request.url, 'redirect_ticket')

      response = build_redirect(clean_url)
      set_verification_cookies(response, request, {
        token: claim['token'],
        creator_hash: claim['creator_hash'] || @config.creator_hash,
        ticket_id: claim['ticket_id'] || ticket_id
      })
      finalize(response)
    rescue Error => e
      debug("Ticket claim failed: #{e.class}: #{e.message}")
      redirect_response(build_video_ad_url(request), request, clear_cookies: true)
    end

    def handle_existing_token(env, request, cookies)
      token = cookies[:token]
      debug('Checking existing token')

      if JwtHelper.token_expired?(token)
        debug('Token expired')
        return redirect_response(build_video_ad_url(request), request, clear_cookies: true)
      end

      validation = JwtHelper.validate_token_claims(token, @config.creator_hash, cookies[:fingerprint])
      unless validation[:valid]
        debug("Token validation failed: #{validation[:reason]}")
        return redirect_response(build_video_ad_url(request), request, clear_cookies: true)
      end

      begin
        @api.validate_token(token)
      rescue Error, StandardError => e
        debug("Backend token validation failed: #{e.class}: #{e.message}")
        return redirect_response(build_video_ad_url(request), request, clear_cookies: true)
      end

      debug('Token valid - allowing access')

      token_expiry = JwtHelper.token_expiry(token)
      cookies_stale = cookies[:verified] != '1' ||
                      cookies[:creator] != @config.creator_hash ||
                      (!token_expiry.nil? && cookies[:expires] != token_expiry.to_s)

      status, headers, body = @app.call(env)
      response = Rack::Response.new(body, status, headers)

      if cookies_stale
        set_verification_cookies(response, request, {
          token: token,
          creator_hash: @config.creator_hash,
          ticket_id: cookies[:ticket]
        })
      end

      finalize(response)
    end

    def build_video_ad_url(request)
      Url.build_video_ad_redirect_url(@config.video_ad_url, @config.creator_hash, request.url)
    end

    def build_redirect(target_url)
      response = Rack::Response.new
      response.status = 302
      response['Location'] = target_url
      response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
      response['Pragma'] = 'no-cache'
      response
    end

    def redirect_response(target_url, request, clear_cookies:)
      response = build_redirect(target_url)
      clear_verification_cookies(response, request) if clear_cookies
      finalize(response)
    end

    def set_verification_cookies(response, request, data)
      max_age = @config.cookie_max_age
      secure  = @config.cookie_secure?(request.env)
      same_site = @config.cookie_same_site

      common = { path: '/', max_age: max_age, secure: secure, same_site: same_site, expires: Time.now + max_age }

      if data[:token] && !data[:token].to_s.empty?
        response.set_cookie(
          @config.cookie_name(Cookies::TOKEN),
          common.merge(value: data[:token], httponly: true)
        )
        response.set_cookie(
          @config.cookie_name(Cookies::VERIFIED),
          common.merge(value: '1', httponly: false)
        )

        expiry = JwtHelper.token_expiry(data[:token])
        if expiry
          response.set_cookie(
            @config.cookie_name(Cookies::EXPIRES),
            common.merge(value: expiry.to_s, httponly: false)
          )
        end
      end

      if data[:creator_hash] && !data[:creator_hash].to_s.empty?
        response.set_cookie(
          @config.cookie_name(Cookies::CREATOR),
          common.merge(value: data[:creator_hash], httponly: false)
        )
      end

      if data[:ticket_id] && !data[:ticket_id].to_s.empty?
        response.set_cookie(
          @config.cookie_name(Cookies::TICKET),
          common.merge(value: data[:ticket_id], httponly: false)
        )
      end
    end

    def clear_verification_cookies(response, request)
      secure = @config.cookie_secure?(request.env)
      same_site = @config.cookie_same_site

      [Cookies::TOKEN, Cookies::VERIFIED, Cookies::CREATOR, Cookies::TICKET, Cookies::EXPIRES].each do |suffix|
        response.delete_cookie(
          @config.cookie_name(suffix),
          path: '/', secure: secure, same_site: same_site,
          httponly: suffix == Cookies::TOKEN
        )
      end
    end

    def finalize(response)
      response.finish
    end

    def debug(message)
      return unless @config.debug

      logger = @config.logger
      if logger.respond_to?(:debug)
        logger.debug("[ShowAd] #{message}")
      else
        warn("[ShowAd] #{message}")
      end
    end
  end
end
