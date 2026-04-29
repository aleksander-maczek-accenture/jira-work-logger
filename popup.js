document.getElementById("openBtn").addEventListener("click", async () => {
  const url = chrome.runtime.getURL("page.html");
  await chrome.tabs.create({ url });
});