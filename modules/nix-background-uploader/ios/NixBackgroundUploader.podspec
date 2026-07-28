Pod::Spec.new do |s|
  s.name           = 'NixBackgroundUploader'
  s.version        = '1.0.0'
  s.summary        = 'Durable iOS background media uploader for NiX'
  s.description    = 'File staging, background URLSession uploads and Live Activity progress updates.'
  s.author         = 'NiX'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoWidgets'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
  s.source_files = '**/*.swift'
end
