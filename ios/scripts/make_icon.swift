import AppKit

let output = CommandLine.arguments.dropFirst().first ?? "RipoBot/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
let pixels = 1024

guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: pixels,
    pixelsHigh: pixels,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fatalError("Could not create icon bitmap context")
}

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
defer { NSGraphicsContext.restoreGraphicsState() }

let canvas = NSRect(x: 0, y: 0, width: pixels, height: pixels)
NSColor.white.setFill()
canvas.fill()

if let gradient = NSGradient(colors: [
    NSColor(calibratedWhite: 1.0, alpha: 1),
    NSColor(calibratedRed: 0.94, green: 0.96, blue: 0.99, alpha: 1)
]) {
    gradient.draw(in: canvas, angle: -90)
}

let center = NSPoint(x: 512, y: 512)
let outer: CGFloat = 335
let inner: CGFloat = 260
let flower = NSBezierPath()
for index in 0..<24 {
    let angle = CGFloat(index) * .pi / 12 - .pi / 2
    let radius = index.isMultiple(of: 2) ? outer : inner
    let point = NSPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius)
    if index == 0 { flower.move(to: point) } else { flower.line(to: point) }
}
flower.close()
NSColor.black.setFill()
flower.fill()

func eye(x: CGFloat, rotation: CGFloat) {
    let rect = NSRect(x: x, y: 423, width: 54, height: 178)
    let path = NSBezierPath(roundedRect: rect, xRadius: 27, yRadius: 27)
    var transform = AffineTransform()
    transform.translate(x: rect.midX, y: rect.midY)
    transform.rotate(byDegrees: rotation)
    transform.translate(x: -rect.midX, y: -rect.midY)
    path.transform(using: transform)
    NSColor.white.setFill()
    path.fill()
}

eye(x: 405, rotation: -5)
eye(x: 565, rotation: 5)
context.flushGraphics()

guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Could not encode PNG")
}
let url = URL(fileURLWithPath: output)
try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
try png.write(to: url)
print("Generated \(url.path) (\(png.count) bytes)")
