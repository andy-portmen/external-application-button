/* globals Parser */
'use strict';

var application = 'com.add0n.node';

var notify = e => chrome.notifications.create(null, {
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: 'Save all Images',
  message: e.message || e
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

function download(url) {
  if (/google\.[^./]+\/url?/.test(url)) {
    const tmp = /url=([^&]+)/.exec(url);
    if (tmp && tmp.length) {
      url = decodeURIComponent(tmp[1]);
    }
  }
  return new Promise((resolve, reject) => {
    chrome.downloads.download({url}, id => {
      function observe(d) {
        if (d.id === id && d.state) {
          if (d.state.current === 'complete' || d.state.current === 'interrupted') {
            chrome.downloads.onChanged.removeListener(observe);
            if (d.state.current === 'complete') {
              chrome.downloads.search({id}, ([d]) => {
                if (d) {
                  resolve(d);
                }
                else {
                  reject('I am not able to find the downloaded file!');
                }
              });
            }
            else {
              reject('The downloading job got interrupted');
            }
          }
        }
      }
      chrome.downloads.onChanged.addListener(observe);
    });
  });
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
              notify(lastError);
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
  try {
    url = new URL(url);
  }
  catch (e) {
    url = {
      href: url
    };
  }

  function step(downloadedPath = '') {
    const termref = {
      lineBuffer: app.args.replace(/\[HREF\]/g, url.href)
        .replace(/\[HOSTNAME\]/g, url.hostname)
        .replace(/\[PATHNAME\]/g, url.pathname)
        .replace(/\[HASH\]/g, url.hash)
        .replace(/\[PROTOCOL\]/g, url.protocol)
        .replace(/\[SELECTIONTEXT\]/g, selectionText)
        .replace(/\[DOWNLOADED_PATH\]/g, downloadedPath)
        .replace(/\[FILENAME\]/g, app.filename)
        .replace(/\[REFERRER\]/g, app.referrer)
        .replace(/\[PROMPT\]/g, () => window.prompt('User input'))
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

  if (app.args.indexOf('[DOWNLOADED_PATH]') === -1) {
    return Promise.resolve(step());
  }
  else {
    return download(url.href).then(d => step(d.filename)).catch(e => notify(e));
  }
}

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'parse') {
    argv(request.app, 'http://example.com/index.html', 'Sample selected text').then(response).catch(e => notify(e));
    return true;
  }
  else if (request.method === 'notify') {
    notify(request.message);
  }
});

function execute(app, tab, selectionText) {
  argv(app, tab.url, selectionText).then(args => chrome.runtime.sendNativeMessage(application, {
    cmd: 'exec',
    command: app.path,
    arguments: args,
    properties: app.quotes ? {windowsVerbatimArguments: true} : {}
  }, r => {
    if (app.closeme) {
      chrome.tabs.remove(tab.id);
    }
    if (!app.errors) {
      response(r);
    }
  })).catch(e => notify(e));
}
chrome.runtime.onMessageExternal.addListener((request, sender, response) => {
  console.log(request);
  chrome.storage.local.get({
    external_allowed: [],
    external_denied: [],
  }, prefs => {
    if (prefs.external_denied.indexOf(sender.id) !== -1) {
      return response(false);
    }
    if (prefs.external_allowed.indexOf(sender.id) === -1) {
      if (window.confirm(`An external application with ID "${sender.id}" requested a new connection.

Should I allow this application to execute OS level commands?`)) {
        chrome.storage.local.set({
          external_allowed: [...prefs.external_allowed, sender.id]
        });
      }
      else {
        chrome.storage.local.set({
          external_denied: [...prefs.external_denied, sender.id]
        });
        return response(false);
      }
    }
    execute(request.app, request.tab, request.selectionText);
    response(true);
  });
  return true;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = info.menuItemId;
  if (id.startsWith('change-to-')) {
    chrome.storage.local.set({
      active: id.replace('change-to-', '')
    });
  }
  else {
    chrome.storage.local.get({
      apps: {}
    }, prefs => {
      const app = prefs.apps[id.replace('-page', '').replace('-link', '')];
      const selectionText = info.selectionText;
      let url = info.pageUrl;
      if (typeof app.context === 'string') {
        app.context = [app.context];
      }
      if (id.endsWith('-page')) {
        url = info.pageUrl || info.frameUrl;
      }
      else { // ends with -link
        if (info.mediaType && app.context.indexOf('link') === -1) {
          url = info.srcUrl || info.linkUrl || info.frameUrl || info.pageUrl;
        }
        else {
          url = info.linkUrl || info.frameUrl || info.pageUrl;
        }
      }
      execute(app, {
        url,
        id: tab.id
      }, selectionText);
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
      execute(prefs.apps[prefs.active], tab);
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
