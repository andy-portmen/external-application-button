/* global Parser */

self.importScripts('termlib_parser.js');
self.importScripts('navigation.js');
self.importScripts('triggers/core.js');

const application = 'com.add0n.node';

const log = (...args) => false && console.log(...args);

const notify = e => {
  const message = e.message || e;
  if (message === 'USER_ABORT') {
    return;
  }

  chrome.notifications.create({
    type: 'basic',
    iconUrl: '/data/icons/48.png',
    title: chrome.runtime.getManifest().name,
    message
  });
};

const prompt = (message, value = '') => new Promise((resolve, reject) => {
  chrome.windows.getCurrent(win => {
    const width = 600;
    const height = 200;
    const left = win.left + Math.round((win.width - width) / 2);
    const top = win.top + Math.round((win.height - height) / 2);

    chrome.windows.create({
      url: '/data/prompt/index.html?message=' + encodeURIComponent(message) + '&value=' + encodeURIComponent(value),
      type: 'popup',
      width,
      height,
      left,
      top
    }, w => prompt.cache[w.id] = {resolve, reject});
  });
});
prompt.cache = {};
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'prompt') {
    port.onDisconnect.addListener(() => {
      const o = prompt.cache[port.sender.tab.windowId];
      if (o) {
        o.resolve();
      }
    });
    port.onMessage.addListener(value => {
      const o = prompt.cache[port.sender.tab.windowId];
      if (o) {
        delete prompt.cache[port.sender.tab.windowId];
        o.resolve(value);
      }
      else {
        console.error('no prompt resolver is found for this window');
      }
    });
  }
});

function error(response) {
  chrome.tabs.query({
    lastFocusedWindow: true,
    active: true
  }, ([tab]) => {
    chrome.action.setBadgeText({
      tabId: tab.id,
      text: 'E'
    });
    chrome.action.setBadgeBackgroundColor({
      tabId: tab.id,
      color: 'red'
    });
    chrome.action.setTitle({
      tabId: tab.id,
      title: `Something went wrong!

-----
Code: ${response.code}
Output: ${response.stdout}
Error: ${response.stderr}`
    });
  });
}

function response(res, tabId, frameId, post) {
  // windows batch returns 1
  if (res && (res.code !== 0 && (res.code !== 1 || res.stderr !== ''))) {
    error(res);
  }
  else if (!res) {
    chrome.tabs.create({
      url: '/data/helper/index.html'
    });
  }
  else if (post) {
    const code = post.replace(/\[POST_SCRIPT_CODE\]/g, res.code)
      .replace(/\[POST_SCRIPT_STDOUT\]/g, res.stdout)
      .replace(/\[POST_SCRIPT_STDERR\]/g, res.stderr);
    chrome.scripting.executeScript({
      world: 'MAIN',
      target: {
        tabId,
        frameIds: [frameId]
      },
      func: code => {
        const s = document.createElement('script');
        s.textContent = code;
        document.body.append(s);
        s.remove();
      },
      args: [code]
    }).catch(e => {
      console.warn(e);
      notify(e);
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
                  reject(Error('I am not able to find the downloaded file!'));
                }
              });
            }
            else {
              reject(Error('The downloading job got interrupted'));
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
      chrome.action.setIcon({
        path: app.icon
      });
      chrome.action.setTitle({
        title: app.name
      });
    }
    else {
      chrome.action.setIcon({
        path: {
          '16': '/data/icons/16.png',
          '32': '/data/icons/32.png',
          '64': '/data/icons/64.png'
        }
      });
      chrome.action.setTitle({
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
        let pattern = ['*://*/*', 'file://*/*'];
        if (prefs.apps[id].pattern) {
          const tmp = prefs.apps[id].pattern;
          pattern = tmp.split(/\s*,\s*/);
        }
        let contexts = prefs.apps[id].context;
        if (typeof contexts === 'string') {
          contexts = [contexts];
        }
        const pageContexts = contexts.filter(s => ['page', 'tab', 'selection', 'editable', 'password', 'bookmark']
          .indexOf(s) !== -1);
        const linkContexts = contexts.filter(s => ['page', 'tab', 'selection', 'editable', 'password', 'bookmark']
          .indexOf(s) === -1);

        function add(obj) {
          obj.contexts = obj.contexts.filter(k => chrome.contextMenus.ContextType[k.toUpperCase()]);
          log(obj);
          chrome.contextMenus.create(obj, () => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              console.warn(lastError);
            }
          });
        }

        const documentUrlPatterns = prefs.apps[id].filters.split(/\s*,\s*/).filter(a => a);

        if (pageContexts.length) {
          add({
            id: id + '-page',
            title: prefs.apps[id].name,
            contexts: pageContexts,
            documentUrlPatterns: documentUrlPatterns.length ? documentUrlPatterns : pattern
          });
        }
        if (linkContexts.length) {
          const o = {
            id: id + '-link',
            title: prefs.apps[id].name,
            contexts: linkContexts,
            targetUrlPatterns: pattern
          };
          if (documentUrlPatterns.length) {
            o.documentUrlPatterns = documentUrlPatterns;
          }
          try {
            add(o);
          }
          catch (e) {
            console.error(e, o);
            notify(`Cannot create context entry for "${prefs.apps[id].name}"


--
${e.message}`);
          }
        }
      });
      const bi = Object.keys(prefs.apps).filter(k => prefs.apps[k].toolbar);
      bi.forEach((id, index) => {
        chrome.contextMenus.create({
          id: 'change-to-' + id,
          title: prefs.apps[id].name,
          contexts: ['action'],
          parentId: (index > 4 && bi.length > 6) ? 'extra' : undefined
        });
        if (index === 4 && bi.length > 6) {
          chrome.contextMenus.create({
            title: 'Extra Applications',
            id: 'extra',
            contexts: ['action']
          });
        }
      });
    });
    self.navigate();
  });
}

async function argv(app, url, selectionText, tab, pre, extra = '') {
  let userAgent = app.userAgent || '';
  let referrer = app.referrer || '';
  let cookie = app.cookie || '';

  const tabId = tab.id;

  if (tabId && app.args.indexOf('[USERAGENT]') !== -1 && !userAgent) {
    await chrome.scripting.executeScript({
      target: {tabId},
      func: () => navigator.userAgent
    }, arr => {
      if (arr && arr[0]) {
        userAgent = arr[0].result;
      }
    });
  }
  if (tabId && app.args.indexOf('[REFERRER]') !== -1 && !referrer) {
    await chrome.scripting.executeScript({
      target: {tabId},
      func: () => document.referrer
    }, arr => {
      if (arr && arr[0]) {
        referrer = arr[0].result;
      }
    });
  }
  if (tabId && app.args.indexOf('[COOKIE]') !== -1 && !cookie) {
    await chrome.scripting.executeScript({
      target: {tabId},
      func: () => document.cookie
    }, arr => {
      if (arr && arr[0]) {
        cookie = arr[0].result;
      }
    });
  }

  try {
    url = new URL(url);
  }
  catch (e) {
    url = {
      href: url
    };
  }

  async function step() {
    const pp = () => { // [PROMPT|message|value]
      const parts = app.args.split('[PROMPT')[1].split(']')[0];
      const r = parts.split('|');

      return prompt(r[1] || 'User Input', r[2] || '').then(a => {
        if (!a) {
          throw Error('USER_ABORT');
        }
        return a;
      });
    };

    const sPrompt = app.args.includes('[PROMPT') ? await pp() : '';

    const dPath = app.args.includes('[DOWNLOADED_PATH]') ? await download(url.href).then(d => d.filename) : '';

    let preArray = [];
    // is "pre" an array
    try {
      const r = JSON.parse(pre);
      if (Array.isArray(r)) {
        preArray = r;
      }
      // escaping double quotes
      pre = pre.replace(/"/g, '\\x22');
    }
    catch (e) {}

    const lineBuffer = app.args
      .replace(/\[EXTRA\]/g, btoa(extra || ''))
      .replace(/\[TITLE\]/g, tab.title)
      .replace(/\[HREF\]/g, url.href)
      .replace(/\[HOSTNAME\]/g, url.hostname)
      .replace(/\[PATHNAME\]/g, url.pathname)
      .replace(/\[HASH\]/g, url.hash)
      .replace(/\[PROTOCOL\]/g, url.protocol)
      .replace(/\[SELECTIONTEXT\]/g, selectionText)
      .replace(/\[DOWNLOADED_PATH\]/g, dPath)
      .replace(/\[FILENAME\]/g, app.filename)
      .replace(/\[REFERRER\]/g, referrer)
      .replace(/\[USERAGENT\]/g, userAgent)
      .replace(/\[COOKIE\]/g, cookie)
      .replace(/\[PRE_SCRIPT:\s*(\d+)\]/g, (str, n) => preArray[n] || '')
      .replace(/\[PRE_SCRIPT\]/g, pre)
      .replace(/\[PROMPT[^]*\]/g, sPrompt)
      .replace(/\\/g, '\\\\');

    const termref = {
      lineBuffer
    };
    const parser = new Parser();
    // fixes https://github.com/andy-portmen/external-application-button/issues/5
    parser.escapeExpressions = {};
    parser.optionChars = {};
    parser.parseLine(termref);

    // merge args (example: --http-header-fields="Referer: undefined")
    // https://github.com/andy-portmen/external-application-button/issues/83
    const fix = [];
    termref.argv.forEach((arg, n) => {
      if (arg.endsWith('=') && termref.argQL[n + 1]) {
        fix.push(n);
      }
    });
    fix.reverse();
    for (const n of fix) {
      const args = [termref.argv[n], termref.argQL[n + 1], termref.argv[n + 1], termref.argQL[n + 1]];
      termref.argv.splice(n, 2, args.join(''));
      termref.argQL.splice(n + 1, 1);
    }

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

  return step();
}

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'parse') {
    argv(request.app, 'http://example.com/index.html', 'Sample selected text', sender.tab, 'PRE_SCIPT_OUTPUT', '{}')
      .then(response)
      .catch(e => notify(e));
    return true;
  }
  else if (request.method === 'notify') {
    notify(request.message);
  }
  else if (request.method === 'execute') {
    chrome.storage.local.get({
      apps: {}
    }, prefs => {
      const app = prefs.apps[request.id];
      if (app) {
        execute(app, {
          url: request.href,
          id: sender.tab.id,
          windowId: sender.tab.windowId
        }, request.selectionText, sender.frameId, request.extra);
      }
      else {
        console.warn('app with requested id cannot be found', request.id);
      }
    });
  }
  else if (request.method === 'bring-to-front') {
    chrome.windows.update(sender.tab.windowId, {
      focused: true
    });
  }
});

function execute(app, tab, selectionText, frameId, extra = '') {
  const next = pre => argv(app, tab.url, selectionText, tab, pre, extra).then(args => {
    const result = r => {
      if (app.closeme && tab.id) {
        chrome.tabs.remove(tab.id);
      }
      if (app.changestate && tab.windowId) {
        chrome.windows.update(tab.windowId, {
          state: app.changestate
        });
      }
      if (!app.errors) {
        response(r, tab.id, frameId, app.post);
      }
    };

    if (app.path === '[SKIP]') {
      result({
        code: 0,
        stdout: 'Native execution is skipped',
        stderr: ''
      });
    }
    else {
      chrome.runtime.sendNativeMessage(application, {
        cmd: 'env'
      }, res => {
        const env = ((res || {}).env || {});
        chrome.runtime.sendNativeMessage(application, {
          cmd: 'exec',
          command: app.path.replace(/%([^%]+)%/g, (a, b) => env[b] || b),
          arguments: args,
          properties: app.quotes ? {windowsVerbatimArguments: true} : {}
        }, r => result(r));
      });
    }
  }).catch(e => notify(e));
  if (app.pre) {
    chrome.scripting.executeScript({
      world: 'MAIN',
      target: {
        tabId: tab.id,
        frameIds: [frameId]
      },
      // use "document.currentScript.output" to assign this value. Does not work on FF so we use custom events
      func: code => {
        let output;
        const s = document.createElement('script');
        s.addEventListener('output', e => {
          e.stopPropagation();
          output = e.detail;
        });
        s.textContent = code + `; document.currentScript.dispatchEvent(new CustomEvent('output', {
          detail: document.currentScript.output
        }))`;
        (document.body || document.documentElement).append(s);
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

        if (document.currentScript) {
          document.currentScript.dataset.result = r; // Firefox
        }
        return r;
      },
      args: [app.pre]
    }).then(arr => {
      if (arr.length) {
        next(arr[0].result);
      }
      else {
        next();
      }
    }).catch(e => {
      console.warn(e);
      notify('Cannot run pre-script: ' + e.message);
      next();
    });
  }
  else {
    next();
  }
}
if (chrome.runtime.onMessageExternal) {
  chrome.runtime.onMessageExternal.addListener((request, sender, response) => {
    chrome.storage.local.get({
      external_allowed: [],
      external_denied: [],
      exaccess: false
    }, prefs => {
      if (prefs.external_denied.indexOf(sender.id) !== -1) {
        response(false);
      }
      else if (prefs.external_allowed.indexOf(sender.id) !== -1) {
        execute(request.app, request.tab, request.selectionText, request.frameId || 0, request.extra);
        response(true);
      }
      else {
        if (prefs.exaccess) {
          prompt(`An external application with the following ID requested a new connection.

  Should I allow this application to execute OS level commands?`, sender.id).then(v => {
            if (v === sender.id) {
              chrome.storage.local.set({
                external_allowed: [...prefs.external_allowed, sender.id]
              });
              execute(request.app, request.tab, request.selectionText, request.frameId || 0, request.extra);
              response(true);
            }
            else {
              chrome.storage.local.set({
                external_denied: [...prefs.external_denied, sender.id]
              });
              response(false);
            }
          });
        }
        else {
          notify(`A request from an extension with ID "${sender.id}" is rejected by the "External Application Button".

To allow external access, visit the options page!`);
        }
      }
    });
    return true;
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.bookmarkId) {
    const node = await new Promise(resolve => chrome.bookmarks.get(info.bookmarkId, ([node]) => resolve(node)));
    tab = {
      url: node.url
    };
  }
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
        url = info.pageUrl || info.frameUrl || tab.url;
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
        ...tab,
        url
      }, selectionText, info.frameId, JSON.stringify(info));
    });
  }
});

{
  let called = false;
  const callback = () => {
    if (called === false) {
      called = true;
      update();
    }
  };
  chrome.runtime.onInstalled.addListener(callback);
  chrome.runtime.onStartup.addListener(callback);
}

chrome.storage.onChanged.addListener(prefs => {
  if (prefs.active || prefs.apps) {
    update();
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.storage.local.get({
    active: null,
    apps: {}
  }, prefs => {
    if (prefs.active) {
      // run on all highlighted tabs
      chrome.tabs.query({
        lastFocusedWindow: true,
        highlighted: true
      }, tabs => {
        for (const tab of tabs) {
          execute(prefs.apps[prefs.active], tab, '', 0, JSON.stringify(tab));
        }
      });
    }
    else {
      chrome.runtime.openOptionsPage();
    }
  });
});

/* pre configure */
chrome.runtime.onInstalled.addListener(e => {
  if (e.reason === 'install') {
    const os = navigator.platform.substr(0, 3).toLocaleLowerCase();
    fetch('configs/' + os + '.json').then(r => r.json()).then(prefs => {
      console.info('*** Configuring the extension for the first run ***');
      chrome.storage.local.set(prefs);
    }).catch(() => {});
  }
});

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const page = getManifest().homepage_url;
    const {name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, lastFocusedWindow: true}, tbs => tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
