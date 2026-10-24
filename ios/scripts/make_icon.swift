import AppKit

let output = CommandLine.arguments.dropFirst().first ?? "RipoBot/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)

image.lockFocus()
defer { image.unlockFocus() }

let canvas = NSRect(origin: .zero, size: size)
NSColor.white.setFill()
canvas.fill()

if let gradient = NSGradient(colors: [
    NSColor(calibratedWhite: 1.0, alpha: 1),
    NSColor(calibratedRed: 0.94, green: 0.96, blue: 0.99, alpha: 1)
]) {
    gradient.draw(in: canvas, angle: -90)
}

let center = NSPoint(x: 512, y: 522)
let outer: CGFloat = 335
let inner: CGFloat = 260
let flower = NSBezierPath()
for index in 0..<24 {
    let angle = CGFloat(index) * .pi / 12 - .pi / 2
    let radius = index.isMultiple(of: 2) ? outer : inner
    let point = NSPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius)
    index == 0 ? flower.move(to: point) : flower.line(to: point)
}
flower.close()
NSColor.black.setFill()
flower.fill()

func eye(x: CGFloat, rotation: CGFloat) {
    let rect = NSRect(x: x, y: 442, width: 54, height: 178)
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

let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
let png = rep.representation(using: .png, properties: [:])!
let url = URL(fileURLWithPath: output)
try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
try png.write(to: url)
print("Generated \(url.path)")
