// navigation

function wildcardToRegExp(s) {
  return '^' + s.split(/\*+/).map(regExpEscape).join('.*') + '$';
}
function regExpEscape(s) {
  return s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

const navigate = () => {
  chrome.storage.local.get({
    apps: {}
  }, prefs => {
    const addRules = [];

    let id = 1;
    for (const [key, o] of Object.entries(prefs.apps)) {
      if (o.redirects) {
        for (const regexFilter of o.redirects.split(/\s*,\s*/).map(wildcardToRegExp)) {
          addRules.push({
            id,
            action: {
              type: 'redirect',
              redirect: {
                regexSubstitution: chrome.runtime.getURL('/data/redirect/index.html?key=' + key + '&href=\\0')
              }
            },
            condition: {
              regexFilter,
              resourceTypes: ['main_frame']
            }
          });
          id += 1;
        }
      }
    }
    if (addRules.length === 0 && !chrome.declarativeNetRequest) {
      return;
    }
    try {
      chrome.declarativeNetRequest.getSessionRules(rs => chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: rs.map(r => r.id),
        addRules
      }));
    }
    catch (e) {
      console.warn(e);
    }
  });
};

self.navigate = navigate;
