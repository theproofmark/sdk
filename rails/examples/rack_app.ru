# frozen_string_literal: true

# Run with: bundle exec rackup examples/rack_app.ru
require 'showad'

use ShowAd::Middleware, ShowAd::Config.new(
  creator_hash:    ENV.fetch('SHOWAD_CREATOR_HASH'),
  api_key:         ENV.fetch('SHOWAD_API_KEY'),
  redirect_secret: ENV.fetch('SHOWAD_REDIRECT_SECRET'),
  protected_paths: ['/premium/*'],
  excluded_paths:  ['/health']
)

run lambda { |env|
  case env['PATH_INFO']
  when '/health'
    [200, { 'content-type' => 'text/plain' }, ['ok']]
  when %r{\A/premium/}
    [200, { 'content-type' => 'text/plain' }, ["Gated content at #{env['PATH_INFO']}"]]
  else
    [200, { 'content-type' => 'text/plain' }, ['Public homepage']]
  end
}
