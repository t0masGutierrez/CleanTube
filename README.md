# CleanTube

<p align="center">
  <img src="src/Assets/icon-source.png" width="128" alt="CleanTube icon">
</p>

CleanTube is a Safari Web Extension for iOS Safari that hides YouTube Shorts surfaces on `youtube.com`, `www.youtube.com`, and `m.youtube.com`.

It cannot affect the native YouTube iOS app. Apple only lets Safari extensions run inside Safari.

## What It Hides

- Shorts tab/navigation entries on desktop and mobile YouTube.
- Shorts recommendation cards and shelves, including dynamically inserted shelves.

## Build For iPhone

The generated Xcode project is at:

```text
src/CleanTube.xcodeproj
```

Regenerate the Xcode project after changing `src/project.yml`:

```sh
npm run build:xcodeproj
```

After installing Xcode 26.4.1 or newer:

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
open src/CleanTube.xcodeproj
```

In Xcode:

1. Select the `CleanTube` project.
2. Set your Apple Development Team on both targets.
3. Build and run `CleanTube` on your iPhone.
4. On the iPhone, open Settings > Safari > Extensions.
5. Enable CleanTube and allow access to YouTube.
6. If you cannot enable CleanTube then open Settings > General > VPN & Device Management > Trust Developer App

## Alternate Packaging

If you prefer Apple’s Safari Web Extension packager, run this after installing Xcode:

```sh
scripts/package-safari.sh
```

The raw WebExtension zip is:

```text
CleanTube-webextension.zip
```
