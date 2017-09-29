/* globals Parser */
'use strict';

var application = 'com.add0n.node';

var notify = message => chrome.notifications.create(null, {
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: 'Save all Images',
  message
});

function error(response) {
  window.alert(`Something went wrong!

-----
Code: ${response.code}
Output: ${response.stdout}
Error: ${response.stderr}`);
}

function response(res) {
  // windows batch returns 1
  if (res && (res.code !== 0 && (res.code !== 1 || res.stderr !== ''))) {
    error(res);
  }
  else if (!res) {
    chrome.tabs.create({
      url: '/data/helper/index.html'
    });
  }
}

function update() {
  chrome.storage.local.get({
    apps: {},
    active: null
  }, prefs => {
    if (prefs.active) {
      const app = prefs.apps[prefs.active];
      chrome.browserAction.setIcon({
        path: app.icon
      });
      chrome.browserAction.setTitle({
        title: app.name
      });
    }
    else {
      chrome.browserAction.setIcon({
        path: {
          '16': 'data/icons/16.png',
          '32': 'data/icons/32.png',
          '64': 'data/icons/64.png'
        }
      });
      chrome.browserAction.setTitle({
        title: 'External Application Button'
      });
    }
    chrome.contextMenus.removeAll(() => {
      Object.keys(prefs.apps).filter(k => {
        const context = prefs.apps[k].context;
        if (!context) {
          return false;
        }
        if (typeof context === 'string') {
          return context;
        }
        else {
          return context.length;
        }
      }).forEach(id => {
        const anyWhere = ['*://*/*', 'file://*/*', 'ftp://*/*'];
        let pattern = anyWhere;
        if (prefs.apps[id].pattern) {
          const tmp = prefs.apps[id].pattern;
          pattern = tmp.split(/\s*,\s*/);
        }
        let contexts = prefs.apps[id].context;
        if (typeof contexts === 'string') {
          contexts = [contexts];
        }
        const pageContexts = contexts.filter(s => ['page', 'tab', 'selection'].indexOf(s) !== -1);
        const linkContexts = contexts.filter(s => ['page', 'tab', 'selection'].indexOf(s) === -1);

        function add(obj) {
          chrome.contextMenus.create(obj, () => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              notify(lastError.message, contexts);
            }
          });
        }

        if (pageContexts.length) {
          add({
            id: id + '-page',
            title: prefs.apps[id].name,
            contexts: pageContexts,
            documentUrlPatterns: pattern
          });
        }
        if (linkContexts.length) {
          add({
            id: id + '-link',
            title: prefs.apps[id].name,
            contexts: linkContexts,
            documentUrlPatterns: anyWhere,
            targetUrlPatterns: pattern
          });
        }
      });
      Object.keys(prefs.apps).filter(k => prefs.apps[k].toolbar).forEach(id => {
        chrome.contextMenus.create({
          id: 'change-to-' + id,
          title: prefs.apps[id].name,
          contexts: ['browser_action'],
        });
      });
    });
  });
}

function argv(app, url, selectionText) {
  const termref = {
    lineBuffer: app.args.replace(/\[HREF\]/g, url)
      .replace(/\[HOSTNAME\]/g, url.hostname)
      .replace(/\[PATHNAME\]/g, url.pathname)
      .replace(/\[HASH\]/g, url.hash)
      .replace(/\[PROTOCOL\]/g, url.protocol)
      .replace(/\[SELECTIONTEXT\]/g, selectionText)
      .replace(/\\/g, '\\\\')
  };
  const parser = new Parser();
  parser.parseLine(termref);

  if (app.quotes) {
    termref.argv = termref.argv.map((a, i) => {
      if (termref.argQL[i]) {
        return termref.argQL[i] + a + termref.argQL[i];
      }
      return a;
    });
  }
  return termref.argv;
}

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'parse') {
    response(argv(request.app, new URL('http://example.com/index.html'), 'Sample selected text'));
  }
});

function execute(app, url, selectionText) {
  chrome.runtime.sendNativeMessage(application, {
    cmd: 'exec',
    command: app.path,
    arguments: argv(app, url, selectionText),
    properties: app.quotes ? {windowsVerbatimArguments: true} : {}
  }, app.errors ? () => {} : response);
}

chrome.contextMenus.onClicked.addListener(info => {
  let id = info.menuItemId;
  if (id.startsWith('change-to-')) {
    chrome.storage.local.set({
      active: id.replace('change-to-', '')
    });
  }
  else {
    id = id.replace('-page', '').replace('-link', '');
    chrome.storage.local.get({
      apps: {}
    }, prefs => {
      const app = prefs.apps[id];
      const selectionText = info.selectionText;
      let url = info.pageUrl;
      if (typeof app.context === 'string') {
        app.context = [app.context];
      }
      if (app.context.indexOf('page') !== -1) {
        url = info.pageUrl;
      }
      else if (app.context.indexOf('frame') !== -1) {
        url = info.frameUrl;
      }
      else if (app.context.indexOf('selection') !== -1) {
        url = info.frameUrl || info.pageUrl;
      }
      else if (app.context.indexOf('link') !== -1) {
        url = info.linkUrl || info.frameUrl || info.pageUrl;
      }
      else if (
        app.context.indexOf('image') !== -1 ||
        app.context.indexOf('video') !== -1 ||
        app.context.indexOf('audio') !== -1) {
        url = info.srcUrl || info.linkUrl || info.frameUrl || info.pageUrl;
      }
      url = new URL(url);
      execute(app, url, selectionText);
    });
  }
});

(function(callback) {
  chrome.runtime.onInstalled.addListener(callback);
  chrome.runtime.onStartup.addListener(callback);
})(update);

chrome.storage.onChanged.addListener(prefs => {
  if (prefs.active || prefs.apps) {
    update();
  }
});

chrome.browserAction.onClicked.addListener(tab => {
  chrome.storage.local.get({
    active: null,
    apps: {}
  }, prefs => {
    if (prefs.active) {
      let url = {};
      try {
        url = new URL(tab.url);
      }
      catch (e) {}
      execute(prefs.apps[prefs.active], url);
    }
    else {
      chrome.runtime.openOptionsPage();
    }
  });
});

// FAQs & Feedback
chrome.storage.local.get('version', prefs => {
  const version = chrome.runtime.getManifest().version;
  const isFirefox = navigator.userAgent.indexOf('Firefox') !== -1;
  if (isFirefox ? !prefs.version : prefs.version !== version) {
    chrome.storage.local.set({version}, () => {
      chrome.tabs.create({
        url: 'http://add0n.com/external-application-button.html?version=' + version +
          '&type=' + (prefs.version ? ('upgrade&p=' + prefs.version) : 'install')
      });
    });
  }
});
{
  const {name, version} = chrome.runtime.getManifest();
  chrome.runtime.setUninstallURL('http://add0n.com/feedback.html?name=' + name + '&version=' + version);
}
