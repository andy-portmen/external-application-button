/* global execute */
const triggers = () => chrome.storage.local.get({
  triggers: []
}, prefs => {
  if (prefs.triggers.some(o => o.action.startsWith('shortcut-'))) {
    chrome.commands.onCommand.addListener(triggers.events.command);
  }
  else {
    chrome.commands.onCommand.removeListener(triggers.events.command);
  }
  if (prefs.triggers.some(o => o.action === 'download-started')) {
    chrome.downloads.onCreated.addListener(triggers.events.created);
  }
  else {
    chrome.downloads.onCreated.removeListener(triggers.events.created);
  }
  if (prefs.triggers.some(o => o.action === 'download-ended')) {
    chrome.downloads.onChanged.addListener(triggers.events.finished);
  }
  else {
    chrome.downloads.onChanged.removeListener(triggers.events.finished);
  }
  chrome.scripting.getRegisteredContentScripts().then(scripts => {
    if (prefs.triggers.some(o => o.action === 'js')) {
      if (scripts.some(s => s.id === 'watch') === false) {
        chrome.scripting.registerContentScripts([{
          'id': 'watch',
          'js': ['/triggers/inject.js'],
          'world': 'ISOLATED',
          'matches': ['*://*/*'],
          'runAt': 'document_idle'
        }]);
      }
    }
    else if (scripts.some(s => s.id === 'watch')) {
      chrome.scripting.unregisterContentScripts({
        ids: ['watch']
      });
    }
  });
});
triggers.execute = (id, extra) => chrome.storage.local.get({
  apps: {}
}, prefs => {
  const app = prefs.apps[id];
  if (app) {
    // run on all highlighted tabs
    chrome.tabs.query({
      lastFocusedWindow: true,
      highlighted: true
    }, tabs => {
      for (const tab of tabs) {
        execute(app, tab, '', 0, extra);
      }
    });
  }
});
triggers.events = {
  command(name) {
    chrome.storage.local.get({
      triggers: []
    }, prefs => {
      for (const {id} of prefs.triggers.filter(o => o.action === name)) {
        triggers.execute(id, '');
      }
    });
  },
  created(d) {
    chrome.storage.local.get({
      triggers: []
    }, prefs => {
      for (const {id} of prefs.triggers.filter(o => o.action === 'download-started')) {
        chrome.downloads.search({
          id: d.id
        }, ([dd]) => {
          triggers.execute(id, JSON.stringify(dd || d));
        });
      }
    });
  },
  finished(d) {
    if (d.state?.current === 'complete') {
      chrome.storage.local.get({
        triggers: []
      }, prefs => {
        for (const {id} of prefs.triggers.filter(o => o.action === 'download-ended')) {
          chrome.downloads.search({
            id: d.id
          }, ([dd]) => {
            triggers.execute(id, JSON.stringify(dd || d));
          });
        }
      });
    }
  }
};

triggers();
chrome.storage.onChanged.addListener(ps => {
  if (ps.triggers) {
    triggers();
  }
});
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.method === 'run-user-action') {
    const id = (Math.random() + 1).toString(36).substring(7);
    chrome.scripting.executeScript({
      world: 'ISOLATED',
      target: {
        tabId: sender.tab.id,
        frameIds: [sender.frameId]
      },
      args: [id, request.id],
      func: (id, rid) => {
        const s = document.createElement('script');
        s.id = id;
        s.addEventListener('run', e => chrome.runtime.sendMessage({
          method: 'execute-action',
          id: rid,
          result: e.detail
        }));
        s.addEventListener('close', e => chrome.runtime.sendMessage({
          method: 'close-me'
        }));
        (document.body || document.documentElement).append(s);
      }
    }).then(() => chrome.scripting.executeScript({
      world: 'MAIN',
      target: {
        tabId: sender.tab.id,
        frameIds: [sender.frameId]
      },
      // use "document.currentScript.output" to assign this value. Does not work on FF so we use custom events
      func: (id, code) => {
        const s = document.getElementById(id);

        code += `; document.currentScript.dispatchEvent(new CustomEvent('output', {
          detail: document.currentScript.output
        }))`;
        let output;

        s.addEventListener('output', e => {
          e.stopPropagation();
          output = e.detail;
        });
        try {
          s.textContent = code;
        }
        // YouTube
        catch (e) {
          const policy = window.trustedTypes.createPolicy('eab-policy', {
            createScript: input => input
          });
          s.textContent = policy.createScript(code);
        }
        s.remove();

        let r = s.output || output || '';
        if (typeof r !== 'string') {
          try {
            r = JSON.stringify(r);
          }
          catch (e) {
            r = 'Error: ' + e.message;
          }
        }

        return r;
      },
      args: [id, request.js]
    })).then(arr => {
      if (arr.length && arr[0].result) {
        triggers.execute(request.id, arr[0].result);
      }
    }).catch(e => {
      console.warn(e);
    });
  }
  else if (request.method === 'execute-action') {
    triggers.execute(request.id, request.result);
  }
  else if (request.method === 'close-me') {
    chrome.tabs.remove(sender.tab.id);
  }
});
