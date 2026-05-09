# frozen_string_literal: true

require 'json'

module ShowAd
  # Backend API client. All network calls funnel through here so that tests
  # can swap in a fake HTTP client without monkey-patching `Net::HTTP`.
  #
  # @example
  #   api = ShowAd::Api.new(config)
  #   claim = api.claim_redirect_ticket('tkt_abc')
  #   api.validate_token('eyJ...')
  class Api
    CLAIM_PATH    = '/api/redirect-ticket/%<id>s/claim'
    VALIDATE_PATH = '/api/sdk/validate'
    HEALTH_PATH   = '/health'

    def initialize(config, http_client: nil)
      @config = config
      @http   = http_client || config.http_client || HttpClient.new
    end

    # Exchange a redirect ticket for a JWT.
    # @raise [TicketNotFound]   on 410
    # @raise [TicketClaimFailed] on 401 or any other non-2xx
    # @raise [CreatorMismatch]  on 403 or response mismatch
    # @raise [NetworkError]     on transport failure
    def claim_redirect_ticket(ticket_id)
      @config.require!(:creator_hash, :api_key, :redirect_secret)

      url = build_url(format(CLAIM_PATH, id: url_segment(ticket_id)))
      response = @http.post(
        url,
        body: { creator_hash: @config.creator_hash },
        headers: {
          'Content-Type'             => 'application/json',
          'X-Redirect-Ticket-Secret' => @config.redirect_secret,
          'X-ShowAd-API-Key'         => @config.api_key,
          'X-ShowAd-Creator-Hash'    => @config.creator_hash
        }
      )

      handle_claim_response(response, ticket_id)
    end

    # Validate a token against the backend. Returns the parsed JSON body.
    # @raise [TokenInvalid] when the backend rejects the token
    # @raise [NetworkError] on transport failure or non-2xx response
    def validate_token(token)
      @config.require!(:creator_hash, :api_key)

      url = build_url(VALIDATE_PATH)
      response = @http.post(
        url,
        body: { token: token, sdk_key: @config.api_key },
        headers: {
          'Content-Type'         => 'application/json',
          'X-ShowAd-API-Key'     => @config.api_key,
          'X-ShowAd-Creator-Hash' => @config.creator_hash
        }
      )

      unless response.ok?
        raise NetworkError.new(
          "Token validation failed: HTTP #{response.status}",
          context: { status: response.status }
        )
      end

      data = response.json || {}
      unless data['valid']
        raise TokenInvalid.new(
          data['message'] || 'Token is invalid',
          context: { response: data }
        )
      end

      data
    end

    # Lightweight backend liveness probe. Never raises.
    # @return [Boolean]
    def check_health
      url = build_url(HEALTH_PATH)
      response = @http.get(url)
      return false unless response.ok?

      data = response.json
      return true if data.nil?

      %w[ok degraded].include?(data['status'].to_s)
    rescue NetworkError
      false
    end

    private

    def build_url(path)
      base = @config.api_base_url.to_s.sub(%r{/+\z}, '')
      "#{base}#{path}"
    end

    def url_segment(value)
      require 'cgi'
      CGI.escape(value.to_s)
    end

    def handle_claim_response(response, ticket_id)
      if response.ok?
        data = response.json
        unless data.is_a?(Hash) && !data['token'].to_s.empty? && !data['creator_hash'].to_s.empty?
          raise TicketClaimFailed.new(
            'Invalid ticket claim response from ShowAd backend',
            context: { ticket_id: ticket_id }
          )
        end

        if data['creator_hash'] != @config.creator_hash
          raise CreatorMismatch.new(
            'Creator hash in claim response does not match configured creator',
            context: { ticket_id: ticket_id, expected: @config.creator_hash, got: data['creator_hash'] }
          )
        end

        return data
      end

      ctx = { ticket_id: ticket_id, status: response.status }
      case response.status
      when 410 then raise TicketNotFound.new('Redirect ticket not found or already consumed', context: ctx)
      when 401 then raise TicketClaimFailed.new('Invalid redirect ticket secret', context: ctx)
      when 403 then raise CreatorMismatch.new('Creator hash does not match ticket', context: ctx)
      else
        raise TicketClaimFailed.new("Failed to claim redirect ticket: HTTP #{response.status}", context: ctx)
      end
    end
  end
end
