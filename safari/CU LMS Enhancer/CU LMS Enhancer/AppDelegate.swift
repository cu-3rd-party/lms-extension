import Cocoa
import Sparkle

@main
class AppDelegate: NSObject, NSApplicationDelegate {
    static let updateAvailabilityChanged = Notification.Name("UpdateAvailabilityChanged")

    let updaterController = SPUStandardUpdaterController(
        startingUpdater: false,
        updaterDelegate: nil,
        userDriverDelegate: nil
    )
    private var updateAvailabilityObservation: NSKeyValueObservation?

    var canCheckForUpdates: Bool {
        updaterController.updater.canCheckForUpdates
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        updateAvailabilityObservation = updaterController.updater.observe(
            \.canCheckForUpdates,
            options: [.initial, .new]
        ) { _, _ in
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: AppDelegate.updateAvailabilityChanged, object: nil)
            }
        }
        updaterController.startUpdater()
    }

    func checkForUpdates() {
        guard updaterController.updater.canCheckForUpdates else { return }
        updaterController.checkForUpdates(nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}
