# Novel Saver web installer

[Install page](https://pkkong.github.io/novel-saver-install/) is a public GitHub Pages site. Open it in desktop Chrome and drag the Novel Saver 2.1.1 link onto the bookmarks bar. The page also includes manual copy instructions.

## Operation

This is for the Booktoki novel chapter-list and text-viewer structure tested at sbxh9.com. It is not a universal downloader. Comic and image-based chapters are unsupported. Other novel websites are unverified; domain or viewer changes require another compatibility check.

This site serves static HTML, CSS, and JavaScript. Saving runs in each computer's browser; novel bodies and authentication data are not uploaded to this installer. Progress is stored per computer. To move progress, export a recovery backup, transfer the file, import it on the new computer, then run Save All to skip already saved chapters.

CAPTCHAs require manual authentication. Saving resumes once chapter text becomes visible.

## Deployment

GitHub Pages publishes the main branch root (/). .nojekyll preserves the static files. The bookmark link in index.html is the URL-encoded novel-dl.js source; update both files together when changing the code.

## Attribution and license

Initial references: nolepguy/novel-dl and yeorinhieut/novel-dl. See NOTICE.md for attribution and LICENSE.txt for the AGPL-3.0 license.
