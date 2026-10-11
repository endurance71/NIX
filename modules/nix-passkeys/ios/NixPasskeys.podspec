Pod::Spec.new do |s|
  s.name           = 'NixPasskeys'
  s.version        = '1.0.0'
  s.summary        = 'NiX passkey (WebAuthn) ceremonies'
  s.description    = 'Local Expo module that runs ASAuthorization passkey assertions and registrations for Supabase Auth.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
