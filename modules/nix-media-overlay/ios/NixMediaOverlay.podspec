Pod::Spec.new do |s|
  s.name           = 'NixMediaOverlay'
  s.version        = '1.0.0'
  s.summary        = 'NiX media drawing and overlay compositor'
  s.description    = 'Local Expo module that edits PencilKit drawings and composites drawings and text onto images and videos.'
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
  s.frameworks = 'AVFoundation', 'UIKit', 'CoreText', 'PencilKit'
end
