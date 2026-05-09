# frozen_string_literal: true

$LOAD_PATH.unshift(File.expand_path('../lib', __dir__))

require 'showad'
require 'rack'
require 'rack/mock'
require 'base64'
require 'json'

Dir[File.expand_path('support/**/*.rb', __dir__)].each { |f| require f }

RSpec.configure do |config|
  config.expect_with :rspec do |c|
    c.syntax = :expect
  end

  config.mock_with :rspec do |mocks|
    mocks.verify_partial_doubles = true
  end

  config.disable_monkey_patching!
  config.example_status_persistence_file_path = '.rspec_persistence'
  config.order = :random
  Kernel.srand config.seed
end

# Build a JWT-shaped token (header.payload.signature) without signing. The
# SDK does not verify signatures, so any 3-part string with valid base64url
# payload is enough to drive the middleware.
def make_token(claims = {})
  header  = Base64.urlsafe_encode64(JSON.generate({ alg: 'none', typ: 'JWT' })).delete('=')
  payload = Base64.urlsafe_encode64(JSON.generate(claims)).delete('=')
  signature = 'sig'
  "#{header}.#{payload}.#{signature}"
end
