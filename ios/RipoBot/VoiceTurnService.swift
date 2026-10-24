import Foundation
import AVFoundation

@MainActor
final class VoiceTurnService: NSObject, ObservableObject {
    @Published var recording = false
    @Published var busy = false
    @Published var level: Float = 0

    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var meterTimer: Timer?
    private var recordingURL: URL?

    func start() async throws {
        let allowed = await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
        guard allowed else { throw RipoAPIError(message: "Microphone permission was not granted.") }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try session.setActive(true)

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("ripo-voice-\(UUID().uuidString).m4a")
        recordingURL = url
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        let recorder = try AVAudioRecorder(url: url, settings: settings)
        recorder.isMeteringEnabled = true
        recorder.prepareToRecord()
        guard recorder.record() else { throw RipoAPIError(message: "The microphone could not start.") }
        self.recorder = recorder
        recording = true
        meterTimer?.invalidate()
        meterTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let recorder = self.recorder else { return }
                recorder.updateMeters()
                let power = recorder.averagePower(forChannel: 0)
                self.level = max(0, min(1, (power + 55) / 55))
            }
        }
    }

    func stopAndTranscribe() async throws -> String {
        guard let recorder, let url = recordingURL else { throw RipoAPIError(message: "No recording is active.") }
        recorder.stop()
        self.recorder = nil
        recording = false
        level = 0
        meterTimer?.invalidate()
        meterTimer = nil
        busy = true
        defer { busy = false }
        let data = try Data(contentsOf: url)
        try? FileManager.default.removeItem(at: url)
        recordingURL = nil
        return try await APIClient.shared.transcribeVoice(data: data)
    }

    func speak(_ text: String) async {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        do {
            let data = try await APIClient.shared.speechData(text: text, language: Locale.current.language.languageCode?.identifier ?? "en")
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
            player = try AVAudioPlayer(data: data)
            player?.prepareToPlay()
            player?.play()
        } catch {
            // Text remains visible when audio playback is unavailable.
        }
    }

    func stopAll() {
        recorder?.stop()
        recorder = nil
        player?.stop()
        player = nil
        meterTimer?.invalidate()
        meterTimer = nil
        recording = false
        busy = false
        level = 0
        if let recordingURL { try? FileManager.default.removeItem(at: recordingURL) }
        recordingURL = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    deinit {
        meterTimer?.invalidate()
        recorder?.stop()
        player?.stop()
    }
}
