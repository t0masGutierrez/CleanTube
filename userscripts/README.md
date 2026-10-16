# CleanTube for Userscripts

CleanTube hides YouTube Shorts and community posts in Safari. Normal videos stay visible. Shorts links open the subscriptions page.

Install `CleanTube.user.js` once through the Userscripts app. This version does not use an Xcode development install, so it does not need weekly renewal. The Mac does not need to stay on or near the iPhone.

## Install on iPhone

1. Install [Userscripts from the App Store](https://apps.apple.com/us/app/userscripts/id1463298887).
2. Open Userscripts. Check its script folder, or select a folder with **Set Userscripts Directory**. A folder under **On My iPhone** keeps the script on the phone.
3. Download [CleanTube.user.js](CleanTube.user.js) on the iPhone, or transfer it with AirDrop or Files. Use the raw file download on GitHub. Save or move it into the folder selected in Userscripts. Keep the `.user.js` file ending. You need only this file.
4. In Settings, open **Apps > Safari > Extensions > Userscripts**. On older iOS versions, the path starts with **Settings > Safari**. Enable Userscripts.
5. Open YouTube in Safari. Open Safari's page menu, then its extensions list and **Userscripts**. Allow access to YouTube. Repeat for `m.youtube.com` if Safari asks. Check that **CleanTube** is enabled in the Userscripts list.
6. Disable the old CleanTube extension in Safari's extension settings. Reload the YouTube tab.

If you use an iCloud Drive folder, select **Keep Downloaded** for it in Files. This helps prevent iCloud from removing the local script copy. No weekly refresh command is needed.

These steps follow the [Userscripts installation guide](https://github.com/quoid/userscripts#usage).

## Check the result

- Open the YouTube home page and subscriptions page in Safari.
- Confirm that normal videos remain visible and Shorts and community posts are hidden.
- Scroll to load more cards. The new Shorts and posts should also be hidden.
- Open a YouTube Shorts link. It should open the subscriptions page.
- Close and reopen Safari. Check that CleanTube remains enabled.

The script only affects `youtube.com`, `www.youtube.com`, and `m.youtube.com`. It does not affect the YouTube app.

## Controls

Both types of blocking are on by default. To stop blocking, turn off CleanTube in the Userscripts list and reload the YouTube tab.

To change one setting, edit this line near the top of the installed file with a text editor:

```js
const settings = Object.freeze({ blockShorts: true, blockPosts: true });
```

Set `blockShorts` or `blockPosts` to `false` to allow that content. Save the file and reload YouTube. The old CleanTube app's settings panel does not control this script. A replacement script file will restore the default settings unless you copy your changes into it.

## Maintenance

YouTube can change its pages. If blocking stops working, the code may need an update. This file does not download updates or other code. To update it, replace the installed file and reload YouTube.

For development, run these commands from the CleanTube project:

```sh
npm ci
npm run build
npm test
npm run test:userscript:browser
```

The build reads `src/Extension/core.js`, `src/Extension/content.css`, `src/Extension/manifest.json`, and `src/Userscript/runtime.js`. The manifest supplies the version and its address list is checked against the three supported YouTube addresses. It writes `userscripts/CleanTube.user.js`. Node.js is needed only to rebuild the file. Xcode and a connected iPhone are not needed.

The browser test uses installed Google Chrome. Set `CHROME_PATH` to use another Chrome executable. It uses local test pages and does not access your YouTube account. These checks do not replace a test with Userscripts in iPhone Safari.


`npm run build` now builds only the userscript. The older app build remains available as `npm run build:ios`. Its source and shared files remain in place. Both development dependencies are still used: `jsdom` for local tests and `puppeteer-core` for Chrome tests.

The script checks changed cards once per animation frame. It checks the complete page at startup and on page navigation or return to a visible tab. Reused cards are checked again, so a normal video can become visible after a blocked card changes.

To measure local scan work, run:

```sh
npm run benchmark:userscript
# Compare two saved versions with the same input:
node scripts/benchmark-userscript.js /path/to/before.user.js userscripts/CleanTube.user.js
```

The test feed has 500 normal video cards. It changes one link 20 times after startup. The report counts whole-page searches, all selector calls, returned descendant matches, and time spent in scheduled script work. A changed root element is checked separately and is not counted as a returned descendant match. It excludes page rendering and is not a Safari speed test. Timing can vary between runs.

The automated checks use local test pages. They cover new content, reused cards, changed links and text, page navigation, Shorts redirects, separate settings, and supported addresses. A fresh-build test also checks that the complete file can run without the source tree. Check actual playback, scrolling, page changes, and the Userscripts extension on iPhone Safari before relying on a release. No iPhone check is included in these commands.


Measured on 2026-10-16 with this local test:

| Measurement | Before cleanup | After cleanup |
| --- | ---: | ---: |
| Whole-page searches during 20 link changes | 80 | 0 |
| Scheduled scan time | 677.91 ms | 4.57 ms |

These are one-run local results. They do not measure iPhone Safari or YouTube network and rendering time.
