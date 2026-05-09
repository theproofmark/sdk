# frozen_string_literal: true

lib = File.expand_path('lib', __dir__)
$LOAD_PATH.unshift(lib) unless $LOAD_PATH.include?(lib)

require 'showad/version'

Gem::Specification.new do |spec|
  spec.name          = 'proofmark-showad'
  spec.version       = ShowAd::VERSION
  spec.authors       = ['ProofMark']
  spec.email         = ['support@proofmark.io']

  spec.summary       = 'ProofMark ShowAd content-gating SDK for Rack applications.'
  spec.description   = 'Rack middleware that gates content behind ProofMark ShowAd ' \
                       'video-ad verification. Works with Rails, Sinatra, Hanami, ' \
                       'or any Rack-compatible application.'
  spec.homepage      = 'https://proofmark.io'
  spec.license       = 'MIT'

  spec.required_ruby_version = '>= 2.7.0'

  spec.metadata['homepage_uri']    = spec.homepage
  spec.metadata['source_code_uri'] = 'https://github.com/proofmark/proofmark/tree/main/sdks/rails'

  spec.files = Dir.chdir(__dir__) do
    Dir.glob('{lib,examples}/**/*') +
      ['README.md', 'showad_rails.gemspec', 'Gemfile', 'Rakefile']
  end
  spec.require_paths = ['lib']

  spec.add_dependency 'rack', '>= 2.0'
  # `base64` was bundled with the standard library through Ruby 3.3 and
  # extracted into a default gem in Ruby 3.4. We pin a permissive range so
  # the gem keeps working on both eras of Ruby without forcing publishers
  # onto a specific minor version.
  spec.add_dependency 'base64', '>= 0.1'

  spec.add_development_dependency 'rspec', '~> 3.12'
  spec.add_development_dependency 'rake',  '~> 13.0'
end
