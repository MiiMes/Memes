const MEMES_APP_URL = "https://miimes.github.io/Memes/";
const MENU_ID = "open-image-in-memes";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Edit image in Memes",
    contexts: ["image"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) return;
  const editorUrl = new URL(MEMES_APP_URL);
  const params = new URLSearchParams({
    source: info.srcUrl,
    title: "Shared image",
  });
  editorUrl.hash = `/editor?${params}`;
  void chrome.tabs.create({ url: editorUrl.href });
});
