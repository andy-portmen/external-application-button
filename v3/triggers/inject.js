chrome.storage.local.get({
  triggers: []
}, prefs => {
  for (const {id, js} of prefs.triggers.filter(o => o.action === 'js')) {
    chrome.runtime.sendMessage({
      method: 'run-user-action',
      id,
      js
    });
  }
});
