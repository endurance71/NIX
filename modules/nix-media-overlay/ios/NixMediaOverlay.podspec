Pod::Spec.new do |s|
  s.name           = 'NixMediaOverlay'
  s.version        = '1.0.0'
  s.summary        = 'NiX bake text overlays onto photos and videos'
  s.description    = 'Local Expo module that composites Snapchat-style text onto images and videos before upload or gallery save.'
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
  s.frameworks = 'AVFoundation', 'UIKit', 'CoreText'
end
