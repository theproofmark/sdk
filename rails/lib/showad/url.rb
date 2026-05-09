# frozen_string_literal: true

require 'uri'
require 'cgi'

module ShowAd
  # URL helpers for building the ShowAd video-ad redirect URL and rewriting
  # the publisher's URL after a successful ticket claim.
  module Url
    DEFAULT_VIDEO_AD_URL = 'https://showad.proofmark.io'

    module_function

    # Build the publisher → video-ad redirect URL, e.g.
    #   https://showad.proofmark.io/c/<creator_hash>?return_url=<url>&sdk=1
    #
    # @param video_ad_url [String]
    # @param creator_hash [String]
    # @param return_url   [String, nil]
    def build_video_ad_redirect_url(video_ad_url, creator_hash, return_url = nil)
      raise ConfigError, 'creator_hash is required' if creator_hash.nil? || creator_hash.empty?

      base = (video_ad_url || DEFAULT_VIDEO_AD_URL).to_s.sub(%r{/+\z}, '')
      url = "#{base}/c/#{CGI.escape(creator_hash.to_s)}"
      params = { 'sdk' => '1' }
      params['return_url'] = return_url if return_url && !return_url.empty?
      "#{url}?#{URI.encode_www_form(params)}"
    end

    # Build the resource-specific redirect URL.
    def build_resource_redirect_url(video_ad_url, creator_hash, project_hash, resource_hash, return_url = nil)
      raise ConfigError, 'creator_hash is required'  if creator_hash.nil?  || creator_hash.empty?
      raise ConfigError, 'project_hash is required'  if project_hash.nil?  || project_hash.empty?
      raise ConfigError, 'resource_hash is required' if resource_hash.nil? || resource_hash.empty?

      base = (video_ad_url || DEFAULT_VIDEO_AD_URL).to_s.sub(%r{/+\z}, '')
      url = "#{base}/c/#{CGI.escape(creator_hash.to_s)}/" \
            "#{CGI.escape(project_hash.to_s)}/#{CGI.escape(resource_hash.to_s)}"
      params = { 'sdk' => '1' }
      params['return_url'] = return_url if return_url && !return_url.empty?
      "#{url}?#{URI.encode_www_form(params)}"
    end

    # Remove a single query parameter from a URL while preserving the rest.
    # @return [String] URL with `param` stripped.
    def remove_query_param(url, param)
      uri = URI.parse(url.to_s)
      query = uri.query
      return uri.to_s if query.nil? || query.empty?

      pairs = URI.decode_www_form(query).reject { |(k, _v)| k == param.to_s }
      uri.query = pairs.empty? ? nil : URI.encode_www_form(pairs)
      uri.to_s
    rescue URI::InvalidURIError
      url.to_s
    end
  end
end
