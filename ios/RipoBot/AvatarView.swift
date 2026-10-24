import SwiftUI

extension Color {
    init(hex: String) {
        let value = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var number: UInt64 = 0
        Scanner(string: value).scanHexInt64(&number)
        let r, g, b: UInt64
        if value.count == 6 {
            (r, g, b) = ((number >> 16) & 255, (number >> 8) & 255, number & 255)
        } else {
            (r, g, b) = (17, 17, 17)
        }
        self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: 1)
    }
}

struct CloudAvatarShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let w = rect.width, h = rect.height
        p.move(to: CGPoint(x: 0.20*w, y: 0.70*h))
        p.addCurve(to: CGPoint(x: 0.16*w, y: 0.43*h), control1: CGPoint(x: 0.04*w, y: 0.65*h), control2: CGPoint(x: 0.04*w, y: 0.49*h))
        p.addCurve(to: CGPoint(x: 0.43*w, y: 0.27*h), control1: CGPoint(x: 0.16*w, y: 0.27*h), control2: CGPoint(x: 0.31*w, y: 0.18*h))
        p.addCurve(to: CGPoint(x: 0.76*w, y: 0.34*h), control1: CGPoint(x: 0.57*w, y: 0.10*h), control2: CGPoint(x: 0.76*w, y: 0.18*h))
        p.addCurve(to: CGPoint(x: 0.87*w, y: 0.64*h), control1: CGPoint(x: 0.98*w, y: 0.35*h), control2: CGPoint(x: 1.00*w, y: 0.56*h))
        p.addCurve(to: CGPoint(x: 0.57*w, y: 0.72*h), control1: CGPoint(x: 0.79*w, y: 0.79*h), control2: CGPoint(x: 0.66*w, y: 0.78*h))
        p.addCurve(to: CGPoint(x: 0.20*w, y: 0.70*h), control1: CGPoint(x: 0.45*w, y: 0.83*h), control2: CGPoint(x: 0.28*w, y: 0.82*h))
        p.closeSubpath()
        return p
    }
}

struct DiamondAvatarShape: Shape {
    func path(in rect: CGRect) -> Path {
        Path { p in
            p.move(to: CGPoint(x: rect.midX, y: rect.minY + rect.height * 0.05))
            p.addLine(to: CGPoint(x: rect.maxX - rect.width * 0.05, y: rect.midY))
            p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY - rect.height * 0.05))
            p.addLine(to: CGPoint(x: rect.minX + rect.width * 0.05, y: rect.midY))
            p.closeSubpath()
        }
    }
}

struct HexAvatarShape: Shape {
    func path(in rect: CGRect) -> Path {
        Path { p in
            p.move(to: CGPoint(x: rect.midX, y: rect.minY + rect.height * 0.04))
            p.addLine(to: CGPoint(x: rect.maxX - rect.width * 0.08, y: rect.height * 0.28))
            p.addLine(to: CGPoint(x: rect.maxX - rect.width * 0.08, y: rect.height * 0.72))
            p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY - rect.height * 0.04))
            p.addLine(to: CGPoint(x: rect.minX + rect.width * 0.08, y: rect.height * 0.72))
            p.addLine(to: CGPoint(x: rect.minX + rect.width * 0.08, y: rect.height * 0.28))
            p.closeSubpath()
        }
    }
}

struct DropAvatarShape: Shape {
    func path(in rect: CGRect) -> Path {
        Path { p in
            p.move(to: CGPoint(x: rect.midX, y: rect.minY + rect.height * 0.03))
            p.addCurve(
                to: CGPoint(x: rect.midX, y: rect.maxY - rect.height * 0.04),
                control1: CGPoint(x: rect.maxX + rect.width * 0.05, y: rect.height * 0.44),
                control2: CGPoint(x: rect.maxX - rect.width * 0.04, y: rect.height * 0.96)
            )
            p.addCurve(
                to: CGPoint(x: rect.midX, y: rect.minY + rect.height * 0.03),
                control1: CGPoint(x: rect.minX + rect.width * 0.04, y: rect.height * 0.96),
                control2: CGPoint(x: rect.minX - rect.width * 0.05, y: rect.height * 0.44)
            )
        }
    }
}

struct FlowerAvatarShape: Shape {
    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let outer = min(rect.width, rect.height) * 0.47
        let inner = outer * 0.72
        return Path { p in
            for index in 0..<24 {
                let angle = Double(index) * .pi / 12 - .pi / 2
                let radius = index.isMultiple(of: 2) ? outer : inner
                let point = CGPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius)
                index == 0 ? p.move(to: point) : p.addLine(to: point)
            }
            p.closeSubpath()
        }
    }
}

@ViewBuilder
private func avatarShape(_ index: Int, color: Color) -> some View {
    switch abs(index) % 8 {
    case 0: Circle().fill(color)
    case 1: RoundedRectangle(cornerRadius: 23, style: .continuous).fill(color)
    case 2: CloudAvatarShape().fill(color)
    case 3: HexAvatarShape().fill(color)
    case 4: DiamondAvatarShape().fill(color)
    case 5: Capsule().fill(color)
    case 6: DropAvatarShape().fill(color)
    default: FlowerAvatarShape().fill(color)
    }
}

struct RipoAvatarView: View {
    let agent: Agent
    var size: CGFloat = 52

    var body: some View {
        let color = Color(hex: agent.avatarColor ?? "#111111")
        ZStack {
            avatarShape(agent.avatarShape ?? 0, color: color)
                .shadow(color: color.opacity(0.12), radius: size * 0.16, y: size * 0.04)

            HStack(spacing: size * 0.12) {
                Capsule()
                    .fill(.white)
                    .frame(width: size * 0.075, height: size * 0.25)
                    .rotationEffect(.degrees(-5))
                Capsule()
                    .fill(.white)
                    .frame(width: size * 0.075, height: size * 0.25)
                    .rotationEffect(.degrees(5))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct RipoBrandView: View {
    var size: CGFloat = 38
    var showText = true

    private var brand: Agent {
        Agent(
            id: "brand",
            name: "Ripo Bot",
            role: "AI",
            description: nil,
            instructions: nil,
            avatar: nil,
            avatarSeed: "ripo-brand-ios",
            avatarShape: 7,
            avatarColor: "#111111",
            avatarMotion: 6,
            avatarVisualVersion: 6,
            state: "ready",
            canRenameSelf: false,
            isPrimary: true
        )
    }

    var body: some View {
        HStack(spacing: 10) {
            RipoAvatarView(agent: brand, size: size)
            if showText {
                Text("Ripo Bot")
                    .font(.system(size: max(18, size * 0.5), weight: .bold, design: .rounded))
                    .tracking(-0.7)
            }
        }
    }
}
