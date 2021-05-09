/* globals browser */

'use strict';

if (typeof browser === 'object') {
  chrome.contextMenus = browser.menus;
}

const app = document.getElementById('app');
const list = document.getElementById('list');
const message = document.getElementById('message');
const remove = document.getElementById('remove');
const add = document.getElementById('add');
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
  icon: app.querySelector('[data-id=icon]'),
  errors: app.querySelector('[data-id=errors]'),
  quotes: app.querySelector('[data-id=quotes]'),
  closeme: app.querySelector('[data-id=closeme]'),
  changestate: app.querySelector('[data-id=changestate]')
};

// hide unsupported items
[...document.querySelectorAll('[data-id=context] input[type=checkbox]')].forEach(e => {
  if (chrome.contextMenus.ContextType[e.value.toUpperCase()] === undefined) {
    e.closest('tr').classList.add('hidden');
  }
});

let id;

function show(msg) {
  window.clearTimeout(id);
  message.textContent = msg;
  id = window.setTimeout(() => message.textContent = '', 5000);
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
    path, args, pre, post, toolbar, context
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
      redirects
    };
    chrome.storage.local.set(prefs, () => {
      update(id);
      show('Done!');
    });
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
  if (!toolbar && !menuitem && redirects === '') {
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
    args, pre, post, toolbar, context, pattern, filters, redirects
  };

  if (icon) {
    if (icon.size > 5 * 1024) {
      return show('"Icon" is too big! use 16x16 PNG.');
    }
    const reader = new FileReader();
    reader.onload = () => {
      s.icon = reader.result;
      callback(s);
    };
    reader.readAsDataURL(icon);
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
    collect(app => {
      chrome.runtime.sendMessage({
        method: 'parse',
        app
      }, resp => {
        const doc = preview.contentDocument;
        doc.body.textContent = '';
        const ul = document.createElement('ul');
        resp.forEach(s => ul.appendChild(Object.assign(doc.createElement('li'), {
          textContent: s
        })));
        doc.body.appendChild(ul);
        preview.style.display = 'block';
      });
    });
  }
  else if (cmd === 'clear') {
    chrome.storage.local.set({
      external_denied: [],
      external_allowed: []
    }, chrome.runtime.sendMessage({
      method: 'notify',
      message: 'Both allowed and denied lists are cleared. New external commands will prompt for user approval!'
    }));
  }
});

document.body.addEventListener('click', () => {
  preview.style.display = 'none';
});

list.addEventListener('change', () => {
  const disabled = list.selectedIndex === -1 || list.selectedIndex === 0;
  remove.disabled = disabled;
  add.value = disabled ? 'Add Application' : 'Update Application';

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
      app.dataset.file = prefs.apps[list.value].icon;
      form.icon.value = '';
      app.dataset.id = list.value;
      if (prefs.apps[list.value].toolbar) {
        chrome.storage.local.set({
          active: list.value
        });
      }
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

chrome.storage.local.get({
  faqs: true,
  exaccess: false
}, prefs => {
  document.getElementById('faqs').checked = prefs.faqs;
  document.getElementById('exaccess').checked = prefs.exaccess;
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
          chrome.storage.local.set(json, () => {
            window.close();
            chrome.runtime.reload();
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

// navigation
form.navigation.addEventListener('change', e => {
  if (e.target.checked) {
    chrome.permissions.request({
      permissions: ['webNavigation'],
      origins: ['*://*/*']
    }, granted => {
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
