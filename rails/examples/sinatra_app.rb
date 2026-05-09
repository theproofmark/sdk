# frozen_string_literal: true

# Run with: bundle exec ruby examples/sinatra_app.rb
require 'sinatra'
require 'showad'

use ShowAd::Middleware, ShowAd::Config.new(
  creator_hash:    ENV.fetch('SHOWAD_CREATOR_HASH'),
  api_key:         ENV.fetch('SHOWAD_API_KEY'),
  redirect_secret: ENV.fetch('SHOWAD_REDIRECT_SECRET'),
  protected_paths: ['/premium/*'],
  excluded_paths:  ['/health']
)

get '/' do
  'Public homepage'
end

get '/health' do
  'ok'
end

get '/premium/:slug' do
  "Gated content: #{params[:slug]}"
end
