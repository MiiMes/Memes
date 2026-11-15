# Optional Chromium context-menu extension

This unpacked Manifest V3 extension adds **Edit image in Memes** to image
context menus and opens the public Memes editor with that image URL. It has no
host permissions, does not fetch or upload the image itself, and does not
include API keys.

To use it with another deployment, change `MEMES_APP_URL` in `background.js`.
In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load
unpacked**, and select this directory.

The editor must be served from a secure origin. Some image hosts block
cross-origin canvas access or downloads; if generation fails, download the
image first and open it with the installed Memes PWA or upload it directly.
The image URL is placed in the new tab's address bar and browser history.
