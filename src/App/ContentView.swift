import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label("Open Settings", systemImage: "gearshape")
                    Label("Choose Safari", systemImage: "safari")
                    Label("Turn on CleanTube", systemImage: "checkmark.shield")
                    Label("Allow youtube.com access", systemImage: "lock.open")
                } header: {
                    Text("Enable Extension")
                }

                Section {
                    Text("CleanTube hides YouTube Shorts navigation, Shorts recommendations, and community posts while you use YouTube in Safari.")
                }
            }
            .navigationTitle("CleanTube")
        }
    }
}

#Preview {
    ContentView()
}
