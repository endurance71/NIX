// Renders an SVG to a PNG of the given pixel size with AppKit (macOS 13+ reads SVG natively).
// `--opaque` writes RGB without an alpha channel (the App Store icon must have none).
// Usage: swift scripts/brand/render-svg.swift <in.svg> <out.png> <size> [--opaque]
import AppKit
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 4, let size = Int(args[3]) else {
  FileHandle.standardError.write("usage: render-svg.swift in.svg out.png size [--opaque]\n".data(using: .utf8)!)
  exit(2)
}
let opaque = args.contains("--opaque")
guard let image = NSImage(contentsOf: URL(fileURLWithPath: args[1])) else {
  FileHandle.standardError.write("cannot read \(args[1])\n".data(using: .utf8)!)
  exit(1)
}

func draw(into context: CGContext) {
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
  NSGraphicsContext.current?.imageInterpolation = .high
  image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
  NSGraphicsContext.restoreGraphicsState()
}

let space = CGColorSpace(name: CGColorSpace.sRGB)!
// Always draw with alpha (AppKit renders SVG into it), then flatten when asked.
let rgba = CGContext(
  data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
draw(into: rgba)
var output = rgba.makeImage()!
if opaque {
  let rgb = CGContext(
    data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  rgb.draw(output, in: CGRect(x: 0, y: 0, width: size, height: size))
  output = rgb.makeImage()!
}
let url = URL(fileURLWithPath: args[2]) as CFURL
let destination = CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(destination, output, nil)
CGImageDestinationFinalize(destination)
