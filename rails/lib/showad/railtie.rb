# frozen_string_literal: true

# Rails integration is opt-in: the file is only loaded when `Rails::Railtie`
# is already defined (see `lib/showad.rb`). That keeps the gem usable in
# Sinatra/Hanami/plain Rack apps without any Rails dependency.
return unless defined?(::Rails::Railtie)

module ShowAd
  # Auto-inserts the Rack middleware into the Rails middleware stack and
  # exposes a `Rails.application.config.showad` configuration block.
  #
  # In `config/application.rb` (or an initializer):
  #
  #     config.showad.creator_hash    = ENV['SHOWAD_CREATOR_HASH']
  #     config.showad.api_key         = ENV['SHOWAD_API_KEY']
  #     config.showad.redirect_secret = ENV['SHOWAD_REDIRECT_SECRET']
  #     config.showad.protected_paths = ['/premium/*']
  class Railtie < ::Rails::Railtie
    config.showad = ::ActiveSupport::OrderedOptions.new if defined?(::ActiveSupport::OrderedOptions)

    initializer 'showad.insert_middleware' do |app|
      options = app.config.showad
      next if options.nil?

      attrs = options.respond_to?(:to_h) ? options.to_h : {}
      next if attrs[:creator_hash].nil? || attrs[:creator_hash].to_s.empty?

      attrs[:logger] ||= ::Rails.logger if defined?(::Rails) && ::Rails.respond_to?(:logger)

      app.middleware.use ShowAd::Middleware, ShowAd::Config.new(**attrs)
    end
  end
end
