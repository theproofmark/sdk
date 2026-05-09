# frozen_string_literal: true

module ShowAd
  # Glob-style path matching shared by the middleware's `protected_paths` and
  # `excluded_paths` configuration. Supports a single `*` wildcard which
  # matches any character including `/` (matches the Laravel and Next.js
  # SDKs' behavior).
  module PathMatch
    module_function

    # @param path    [String] request path, leading slash optional
    # @param pattern [String] pattern, may contain `*`
    def matches?(path, pattern)
      return false if path.nil? || pattern.nil?

      normalized_path = '/' + path.to_s.sub(%r{\A/+}, '')
      normalized_pattern = '/' + pattern.to_s.sub(%r{\A/+}, '')

      return true if normalized_path == normalized_pattern

      if normalized_pattern.include?('*')
        regex = Regexp.escape(normalized_pattern).gsub('\\*', '.*')
        return Regexp.new("\\A#{regex}\\z").match?(normalized_path)
      end

      false
    end

    # @return [Boolean] true when `path` matches at least one pattern.
    def matches_any?(path, patterns)
      Array(patterns).any? { |p| matches?(path, p) }
    end
  end
end
