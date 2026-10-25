/* global mcp */

const app = document.getElementById('app');
const list = document.getElementById('list');
const message = document.getElementById('message');
const remove = document.getElementById('remove');
const preview = document.getElementById('preview');
const form = {
  path: app.querySelector('[data-id=path]'),
  name: app.querySelector('[data-id=name]'),
  args: app.querySelector('[data-id=arguments]'),
  pre: app.querySelector('[data-id=pre]'),
  post: app.querySelector('[data-id=post]'),
  toolbar: app.querySelector('[data-id=toolbar]'),
  menuitem: app.querySelector('[data-id=menuitem]'),
  context: app.querySelector('[data-id=context]'),
  pattern: app.querySelector('[data-id=pattern]'),
  filters: app.querySelector('[data-id=filters]'),
  redirects: app.querySelector('[data-id=redirects]'),
  navigation: app.querySelector('[data-id=navigation]'),
  index: app.querySelector('[data-id=index]'),
  icon: app.querySelector('[data-id=icon]'),
  errors: app.querySelector('[data-id=errors]'),
  quotes: app.querySelector('[data-id=quotes]'),
  closeme: app.querySelector('[data-id=closeme]'),
  changestate: app.querySelector('[data-id=changestate]')
};

// hide unsupported items
if (typeof chrome.contextMenus.ContextType !== 'undefined') {
  [...document.querySelectorAll('[data-id=context] input[type=checkbox]')].forEach(e => {
    if (chrome.contextMenus.ContextType[e.value.toUpperCase()] === undefined) {
      e.closest('label').classList.add('hidden');
    }
  });
}

let id;

function show(msg, type = 'error') {
  clearTimeout(id);
  message.dataset.type = type;
  message.textContent = msg;
  id = setTimeout(() => message.textContent = '', 5000);
}

function update(value) {
  list.textContent = '';
  chrome.storage.local.get({
    apps: {},
    save: ''
  }, prefs => {
    prefs.apps = Object.assign({
      blank: {
        name: '- new -'
      }
    }, prefs.apps);
    Object.keys(prefs.apps).forEach(id => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = prefs.apps[id].name;
      list.appendChild(option);
    });
    if (value) {
      list.value = value;
    }
    else if (prefs.save && prefs.apps[prefs.save]) {
      list.value = prefs.save;
    }
    else {
      list.value = 'blank';
    }
    list.dispatchEvent(new Event('change'));
  });
}
chrome.storage.local.get({
  active: ''
}, prefs => update(prefs.active));

function save(o) {
  const {
    id, icon, errors, quotes, closeme, changestate, name,
    path, args, pre, post, toolbar, context, index
  } = o;
  let {pattern, filters, redirects} = o;

  pattern = (pattern || '').split(/\s*,\s*/).filter((s, i, l) => l.indexOf(s) === i).join(', ');
  filters = (filters || '').split(/\s*,\s*/).filter((s, i, l) => l.indexOf(s) === i).join(', ');
  redirects = (redirects || '').split(/\s*,\s*/).filter((s, i, l) => l.indexOf(s) === i).join(', ');

  chrome.storage.local.get({
    apps: {}
  }, prefs => {
    prefs.apps[id] = {
      icon,
      errors,
      quotes,
      closeme,
      changestate,
      name,
      path,
      args,
      pre,
      post,
      toolbar,
      context,
      pattern,
      filters,
      redirects,
      index
    };
    chrome.storage.local.set(prefs, () => {
      update(id);
      show('Done!', 'success');
    });
  });
}

function testArguments() {
  // this test only cares about the Arguments field; no other form validation applies
  const args = form.args.value;
  if (args.trim() === '') {
    return show('There is no argument to validate. Fill the "Arguments" box first.');
  }

  const o = {
    name: form.name.value || 'test',
    path: form.path.value || '[SKIP]',
    args,
    quotes: form.quotes.checked
  };

  chrome.runtime.sendMessage({
    method: 'parse',
    app: o
  }, resp => {
    // recreate the iframe: a document inside a closed dialog may not be ready
    const container = preview.querySelector('.iframe-container');
    container.querySelector('iframe')?.remove();
    const frame = document.createElement('iframe');
    frame.src = 'blank.html';
    frame.title = 'Arguments preview';
    frame.onload = () => {
      const slot = frame.contentDocument.getElementById('args');
      const ul = document.createElement('ul');
      resp.forEach(s => ul.appendChild(Object.assign(frame.contentDocument.createElement('li'), {
        textContent: s
      })));
      slot.replaceChildren(ul);
      preview.showModal();
    };
    container.appendChild(frame);
  });
}

function collect(callback) {
  const id = app.dataset.id || Math.random();

  const name = form.name.value;
  if (!name) {
    return show('"Display Name" is mandatory');
  }
  const path = form.path.value;
  if (!path) {
    return show('"Executable Name" is mandatory');
  }
  const args = form.args.value;
  const pre = form.pre.value;
  const post = form.post.value;
  const toolbar = form.toolbar.checked;
  const menuitem = form.context.querySelector(':checked');
  const redirects = form.navigation.checked ? form.redirects.value : '';
  const index = form.index.valueAsNumber ? Math.max(form.index.valueAsNumber, 1) : '';
  if (!toolbar && !menuitem && redirects === '') {
    activatePtab('toolbar');
    return show('Select a placement for this application, or configure automatic navigation');
  }
  const context = [...form.context.querySelectorAll(':checked')].map(e => e.value);
  const pattern = form.pattern.value;
  const filters = form.filters.value;
  const errors = form.errors.checked;
  const quotes = form.quotes.checked;
  const closeme = form.closeme.checked;
  const changestate = form.changestate.value;
  const icon = form.icon.files[0];
  if (!icon && !app.dataset.file) {
    app.dataset.file = '/data/icons/app.png';
  }

  const s = {
    id, name, errors, quotes, closeme, changestate, path,
    args, pre, post, toolbar, context, pattern, filters, redirects, index
  };

  if (icon) {
    if (!icon.type.startsWith('image/')) {
      return show('Invalid image file!');
    }
    // downscale the icon to 64x64 max to keep the storage entry small
    const image = new Image();
    const objectURL = URL.createObjectURL(icon);
    image.onload = () => {
      URL.revokeObjectURL(objectURL);
      const size = 64;
      const scale = Math.min(1, size / Math.max(image.naturalWidth || size, image.naturalHeight || size));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      try {
        s.icon = canvas.toDataURL('image/png');
      }
      catch (e) {
        console.error(e);
        return show('Cannot process the icon image');
      }
      callback(s);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectURL);
      show('Invalid image file!');
    };
    image.src = objectURL;
  }
  else {
    s.icon = app.dataset.file;
    callback(s);
  }
}

document.addEventListener('click', e => {
  const target = e.target;
  const cmd = target.dataset.cmd;
  if (cmd === 'add') {
    collect(save);
  }
  else if (cmd === 'remove') {
    chrome.storage.local.get({
      apps: {},
      active: null
    }, prefs => {
      delete prefs.apps[list.value];
      if (prefs.active === list.value) {
        prefs.active = null;
      }
      chrome.storage.local.set(prefs, update);
    });
  }
  else if (cmd === 'insert') {
    const text = target.dataset.value;
    const startPos = form.args.selectionStart;
    const endPos = form.args.selectionEnd;
    form.args.value = form.args.value.substring(0, startPos) +
      text +
      form.args.value.substring(endPos, form.args.value.length);
    form.args.selectionStart = startPos + text.length;
    form.args.selectionEnd = startPos + text.length;
    form.args.focus();
  }
  else if (cmd === 'example') {
    form.name.value = target.dataset.name;
    form.path.value = target.dataset.path;
    form.args.value = target.dataset.args;
  }
  else if (cmd === 'test') {
    testArguments();
  }
  else if (cmd === 'clear') {
    chrome.storage.local.set({
      external_denied: [],
      external_allowed: []
    }, () => chrome.runtime.sendMessage({
      method: 'notify',
      message: 'Both allowed and denied lists are cleared. New external commands will prompt for user approval!'
    }));
  }
});

// close the dialog on clicks outside its content (backdrop)
preview.addEventListener('click', ({target}) => {
  if (target === preview) {
    preview.close();
  }
});

list.addEventListener('change', () => {
  const disabled = list.selectedIndex === -1 || list.selectedIndex === 0;
  remove.disabled = disabled;
  add.value = disabled ? 'Add Application' : 'Edit Application';

  chrome.storage.local.set({
    save: list.value
  });

  if (!disabled) {
    chrome.storage.local.get({
      apps: {}
    }, prefs => {
      form.name.value = prefs.apps[list.value].name;
      form.errors.checked = prefs.apps[list.value].errors;
      form.quotes.checked = prefs.apps[list.value].quotes;
      form.closeme.checked = prefs.apps[list.value].closeme;
      form.changestate.value = prefs.apps[list.value].changestate || '';
      form.path.value = prefs.apps[list.value].path;
      form.args.value = prefs.apps[list.value].args;
      form.pre.value = prefs.apps[list.value].pre;
      form.post.value = prefs.apps[list.value].post;
      form.toolbar.checked = prefs.apps[list.value].toolbar;
      [...form.context.querySelectorAll(':checked')].forEach(e => e.checked = false);
      let contexts = prefs.apps[list.value].context;
      if (typeof contexts === 'string') {
        contexts = [contexts];
      }
      contexts.forEach(value => {
        form.context.querySelector(`[value="${value}"]`).checked = true;
      });
      form.pattern.value = prefs.apps[list.value].pattern || '';
      form.filters.value = prefs.apps[list.value].filters || '';
      form.redirects.value = prefs.apps[list.value].redirects || '';
      if (form.redirects.value) {
        form.navigation.checked = true;
      }
      form.index.value = prefs.apps[list.value].index || '';

      app.dataset.file = prefs.apps[list.value].icon;
      form.icon.value = '';
      app.dataset.id = list.value;
      chrome.storage.local.set({
        active: prefs.apps[list.value].toolbar ? list.value : ''
      });
    });
  }
  else {
    delete app.dataset.file;
    delete app.dataset.id;
  }
});

// support
document.getElementById('support').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
}));

document.getElementById('faqs').addEventListener('change', e => chrome.storage.local.set({
  faqs: e.target.checked
}));

document.getElementById('exaccess').addEventListener('change', e => chrome.storage.local.set({
  exaccess: e.target.checked
}));

// MCP
document.getElementById('mcp-server').addEventListener('change', e => chrome.storage.local.set({
  'mcp-server': e.target.checked
}));
document.getElementById('mcp-log').addEventListener('change', e => chrome.storage.local.set({
  'mcp-log': e.target.checked
}));
document.getElementById('mcp-extensions').addEventListener('change', e => chrome.storage.local.set({
  'mcp-extensions': e.target.value.split(/\s*,\s*/).filter((s, n, l) => s && l.indexOf(s) === n)
}));
document.getElementById('mcp-socket-postfix').addEventListener('change', e => {
  const value = e.target.value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 32);
  e.target.value = value;
  chrome.storage.local.set({
    'mcp-socket-postfix': value
  });
});

chrome.storage.local.get({
  'faqs': true,
  'exaccess': false,
  'mcp-server': false,
  'mcp-log': false,
  'mcp-extensions': [],
  'mcp-socket-postfix': ''
}, prefs => {
  document.getElementById('faqs').checked = prefs.faqs;
  document.getElementById('exaccess').checked = prefs.exaccess;
  document.getElementById('mcp-server').checked = prefs['mcp-server'];
  document.getElementById('mcp-log').checked = prefs['mcp-log'];
  document.getElementById('mcp-extensions').value = prefs['mcp-extensions'].join(', ');
  document.getElementById('mcp-socket-postfix').value = prefs['mcp-socket-postfix'];
});
const updateSocketPath = () => mcp.socket().then(path => {
  document.getElementById('mcp-socket').textContent = path.replaceAll('\\', '\\\\');
});
updateSocketPath();
chrome.storage.onChanged.addListener(ps => {
  if ('mcp-socket-postfix' in ps) {
    updateSocketPath();
  }
});

// export
document.getElementById('export').addEventListener('click', () => {
  chrome.storage.local.get(null, prefs => {
    const text = JSON.stringify(prefs, null, '\t');
    const blob = new Blob([text], {type: 'application/json'});
    const objectURL = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: objectURL,
      type: 'application/json',
      download: 'external-application-button-preferences.json'
    }).dispatchEvent(new MouseEvent('click'));
    setTimeout(() => URL.revokeObjectURL(objectURL));
  });
});
// import
document.getElementById('import').addEventListener('click', () => {
  const fileInput = document.createElement('input');
  fileInput.style.display = 'none';
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.acceptCharset = 'utf-8';

  document.body.appendChild(fileInput);
  fileInput.initialValue = fileInput.value;
  fileInput.onchange = readFile;
  fileInput.click();

  function readFile() {
    if (fileInput.value !== fileInput.initialValue) {
      const file = fileInput.files[0];
      if (file.size > 100e6) {
        console.warn('100MB backup? I don\'t believe you.');
        return;
      }
      const fReader = new FileReader();
      fReader.onloadend = event => {
        fileInput.remove();
        const json = JSON.parse(event.target.result);
        chrome.storage.local.clear(() => {
          const clearError = chrome.runtime.lastError;
          if (clearError) {
            return show(clearError.message);
          }
          chrome.storage.local.set(json, () => {
            const setError = chrome.runtime.lastError;
            if (setError) {
              return show(setError.message);
            }
            chrome.runtime.sendMessage({
              method: 'refresh-context-menus'
            }, refreshed => {
              const refreshError = chrome.runtime.lastError;
              if (refreshError) {
                return show(refreshError.message);
              }
              if (refreshed !== true) {
                return show('Settings were imported, but the context menus could not be refreshed.');
              }
              window.close();
            });
          });
        });
      };
      fReader.readAsText(file, 'utf-8');
    }
  }
});

document.getElementById('ofq').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url
}));

document.getElementById('triggers').addEventListener('click', () => chrome.tabs.create({
  url: '/triggers/index.html'
}));

// navigation
form.navigation.addEventListener('change', e => {
  if (e.target.checked) {
    chrome.permissions.request({
      origins: ['*://*/*']
    }, granted => {
      const lastError = chrome.runtime.lastError;

      if (lastError) {
        show(lastError.message);
      }
      if (granted !== true) {
        e.target.checked = false;
      }
    });
  }
});
form.redirects.addEventListener('input', () => {
  if (form.navigation.checked === false) {
    form.navigation.click();
  }
});

// links
for (const a of [...document.querySelectorAll('[data-href]')]) {
  if (a.hasAttribute('href') === false) {
    a.href = chrome.runtime.getManifest().homepage_url + '#' + a.dataset.href;
  }
}

// tabs permission
document.getElementById('tabs-permission').onclick = e => chrome.permissions.request({
  permissions: ['tabs'],
  origins: ['*://*/*']
}, granted => {
  if (granted) {
    e.target.remove();
  }
});

chrome.permissions.contains({
  permissions: ['tabs'],
  origins: ['*://*/*']
}, granted => {
  if (granted) {
    document.getElementById('tabs-permission').remove();
  }
});

// native integration
const nativeStatus = document.getElementById('native-status');
const nativeApp = 'com.add0n.node';

{
  const ua = navigator.userAgent;
  if (ua.indexOf('Mac') !== -1 || ua.indexOf('Linux') !== -1 || ua.indexOf('X11') !== -1) {
    document.body.dataset.os = 'linux';
  }
  else {
    document.body.dataset.os = 'windows';
  }
}

function setNativeStatus(state, message, version) {
  nativeStatus.dataset.state = state;
  nativeStatus.textContent = message;
  if (version) {
    const versions = version.split('.').map(Number);
    const major = versions[0] * 100 + (versions[1] || 0) * 10 + (versions[2] || 0);
    if (major < 110) {
      nativeStatus.dataset.state = 'warn';
      nativeStatus.textContent += '. The MCP Server requires version 1.1.0 or higher. Please update the native client!';
    }
  }
}

function checkNativeClient() {
  setNativeStatus('unknown', 'Checking the native client…');
  chrome.runtime.sendNativeMessage(nativeApp, {
    cmd: 'version'
  }, response => {
    const lastError = chrome.runtime.lastError;
    if (lastError) {
      console.warn(lastError);
      return setNativeStatus('error', 'Native client is not detected. Follow the steps below to install it');
    }
    if (response) {
      return setNativeStatus('ok', 'Native client version ' + response.version + ' is installed', response.version);
    }
    setNativeStatus('error', 'Native client is not detected. Follow the steps below to install it');
  });
}

document.getElementById('native-check').addEventListener('click', checkNativeClient);

document.getElementById('native-download').addEventListener('click', () => {
  const os = document.body.dataset.os || 'windows';

  setNativeStatus('unknown', 'Looking for the latest version of the native client…');

  const req = new XMLHttpRequest();
  req.open('GET', 'https://api.github.com/repos/andy-portmen/native-client/releases/latest');
  req.responseType = 'json';
  req.onload = () => {
    try {
      const asset = req.response.assets.filter(a => a.name === os + '.zip')[0];
      chrome.downloads.download({
        filename: os + '.zip',
        url: asset.browser_download_url
      }, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.warn(lastError);
          return setNativeStatus('error', 'Cannot initiate the download. Please download the package manually from GitHub releases');
        }
        setNativeStatus('ok', 'Download is started. Extract and install when it is done');
      });
    }
    catch (e) {
      console.warn(e);
      setNativeStatus('error', 'Something went wrong! Please download the package manually from GitHub releases');
    }
  };
  req.onerror = () => setNativeStatus('error', 'Something went wrong! Please download the package manually from GitHub releases');
  req.send();
});

checkNativeClient();

// tab navigation
const tabButtons = [...document.querySelectorAll('#tabs button')];
const tabSections = new Map(tabButtons.map(b => [b.dataset.tab, document.getElementById('tab-' + b.dataset.tab)]));

function activateTab(tab, setHash = true) {
  if (!tabSections.has(tab)) {
    tab = 'app';
  }
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  tabSections.forEach((s, key) => s.hidden = key !== tab);
  if (setHash) {
    history.replaceState(null, '', '#' + tab);
  }
}

tabButtons.forEach(b => b.addEventListener('click', () => {
  activateTab(b.dataset.tab);
  if (b.dataset.tab === 'native') {
    checkNativeClient();
  }
}));

window.addEventListener('hashchange', () => activateTab(location.hash.slice(1), false));

const initialTab = location.hash.slice(1);
activateTab(initialTab, false);

// placement sub-tabs
const ptabButtons = [...document.querySelectorAll('#placement-tabs button')];
const ptabPanels = new Map(ptabButtons.map(b => [b.dataset.ptab, document.getElementById('ptab-' + b.dataset.ptab)]));

function activatePtab(tab) {
  if (!ptabPanels.has(tab)) {
    tab = 'toolbar';
  }
  ptabButtons.forEach(b => b.classList.toggle('active', b.dataset.ptab === tab));
  ptabPanels.forEach((p, key) => p.hidden = key !== tab);
}

ptabButtons.forEach(b => b.addEventListener('click', () => activatePtab(b.dataset.ptab)));

// enforce the initial hidden state (in case the attributes are missing)
activatePtab('toolbar');

