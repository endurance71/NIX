Pod::Spec.new do |s|
  s.name           = 'NixCameraTorch'
  s.version        = '1.0.0'
  s.summary        = 'NiX iOS camera torch controls'
  s.description    = 'Local Expo module for deterministic iOS camera torch control during video capture.'
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
