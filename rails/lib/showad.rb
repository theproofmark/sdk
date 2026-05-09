# frozen_string_literal: true

require 'showad/version'

# Top-level namespace for the ProofMark ShowAd Rack SDK.
#
# Files are autoloaded so that `require 'showad'` is enough to access any
# public class without paying for the full set of dependencies on boot.
module ShowAd
  autoload :Config,        'showad/config'
  autoload :Error,         'showad/error'
  # Sibling error classes live in the same file as `Error`, so register
  # autoloads for each of them. Otherwise an unqualified `TicketNotFound`
  # reference inside `ShowAd::Api` triggers `NameError` (Ruby's autoload
  # only fires for the constant whose name was registered).
  autoload :TicketNotFound,    'showad/error'
  autoload :TicketClaimFailed, 'showad/error'
  autoload :CreatorMismatch,   'showad/error'
  autoload :TokenInvalid,      'showad/error'
  autoload :NetworkError,      'showad/error'
  autoload :ConfigError,       'showad/error'
  autoload :Cookies,       'showad/cookies'
  autoload :Url,           'showad/url'
  autoload :PathMatch,     'showad/path_match'
  autoload :JwtHelper,     'showad/jwt_helper'
  autoload :HttpClient,    'showad/http_client'
  autoload :Api,           'showad/api'
  autoload :AccessPolicy,  'showad/access_policy'
  autoload :Middleware,    'showad/middleware'
end

require 'showad/railtie' if defined?(::Rails::Railtie)
