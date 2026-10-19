# Novel Saver web installer

[Install page](https://pkkong.github.io/novel-saver-install/) is a public GitHub Pages site. Open it in desktop Chrome and drag the 소설 저장 link onto the bookmarks bar. The page also includes manual copy instructions.

## Operation

This is for the Booktoki novel chapter-list and text-viewer structure tested at sbxh9.com. It is not a universal downloader. Comic and image-based chapters are unsupported. Other novel websites are unverified; domain or viewer changes require another compatibility check.

This site serves static HTML, CSS, and JavaScript. Saving runs in each computer's browser; novel bodies and authentication data are not uploaded to this installer. Progress is stored per computer. To move progress, export a recovery backup, transfer the file, import it on the new computer, then run Save All to skip already saved chapters.

CAPTCHAs require manual authentication. Saving resumes once chapter text becomes visible.

## Deployment

GitHub Pages publishes the main branch root (/). .nojekyll preserves the static files. The bookmark link in index.html is the URL-encoded novel-dl.js source; update both files together when changing the code.

## Attribution and license

Initial references: nolepguy/novel-dl and yeorinhieut/novel-dl. See NOTICE.md for attribution and LICENSE.txt for the AGPL-3.0 license.

Version 2.2.0 adds progress/ETA, immediate pause, a minimized launcher, and direct cached TXT export. Existing bookmarks must be replaced manually.

The installer uses self-hosted Pretendard Variable v1.3.9 dynamic subsets from https://github.com/orioncactus/pretendard. Font files are unmodified and licensed under SIL OFL 1.1; see assets/fonts/pretendard/LICENSE.txt. Only subsets needed for rendered characters are requested.

The installer separates bookmark setup from saving instructions, with a bookmarks-bar illustration and expandable help for manual setup, updates, and moving progress.

Version 2.2.1 determines the full save range from the chapter list, including lists numbered 2–251 with a count of 250. Existing bookmarks need to be replaced to receive this fix.

The guide follows the reader’s order: open sbxh9.com, choose a novel from the 소설 menu and keep its chapter list open, return here to add the bookmark once, then return to the work’s tab to save. The site links open a separate tab.
