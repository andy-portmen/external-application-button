// Triggers tab; runs alongside index.js without sharing its globals

(() => {
  const section = document.getElementById('tab-triggers');
  const container = section.querySelector('#triggers');
  const template = section.querySelector('#trigger-template');
  const toast = section.querySelector('#triggers-toast');
  const buttons = {
    shortcuts: section.querySelector('#triggers-shortcuts'),
    remove: section.querySelector('#triggers-remove'),
    add: section.querySelector('#triggers-add'),
    save: section.querySelector('#triggers-save')
  };

  let id;
  let initialized = false;

  function show(msg) {
    clearTimeout(id);
    toast.textContent = msg;
    id = setTimeout(() => toast.textContent = '', 5000);
  }

  function addRow(trigger) {
    const node = document.importNode(template.content, true);
    if (trigger) {
      node.querySelector('.name').value = trigger.id;
      node.querySelector('.action').value = trigger.action;
      node.querySelector('textarea').value = trigger.js;
      if (trigger.action === 'js') {
        node.querySelector('textarea').disabled = false;
      }
    }
    container.append(node);
  }

  function onValue({apps, triggers}) {
    const entries = Object.entries(apps);
    if (entries.length === 0) {
      window.show('Add new apps from the "Application Setup" tab first');
      return;
    }
    const name = template.content.querySelector('.name');
    for (const [id, {name: label}] of entries) {
      const option = document.createElement('option');
      option.textContent = label;
      option.value = id;
      name.append(option);
    }
    buttons.add.disabled = false;
    for (const trigger of triggers) {
      addRow(trigger);
    }
    initialized = true;
  }

  function check() {
    if (initialized) {
      return;
    }
    chrome.storage.local.get({
      apps: {},
      triggers: []
    }, onValue);
  }

  buttons.add.addEventListener('click', () => addRow());

  section.addEventListener('change', e => {
    // remove button
    const selected = section.querySelector('input[type=checkbox]:checked');
    buttons.remove.disabled = !selected;
    // js
    const p = e.target.closest('.trigger');
    if (p && e.target.type === 'select-one') {
      p.querySelector('textarea').disabled = e.target.value !== 'js';

      if (e.target.value === 'js') {
        chrome.permissions.request({
          origins: ['*://*/*']
        }, granted => {
          if (!granted) {
            e.target.value = 'shortcut-1';
            p.querySelector('textarea').disabled = true;
          }
        });
      }
    }
  });

  buttons.shortcuts.addEventListener('click', () => chrome.tabs.create({
    url: 'chrome://extensions/shortcuts'
  }));

  buttons.save.addEventListener('click', () => {
    const triggers = [];
    for (const e of section.querySelectorAll('.trigger')) {
      triggers.push({
        id: e.querySelector('.name').value,
        action: e.querySelector('.action').value,
        js: e.querySelector('textarea').value
      });
    }
    chrome.storage.local.set({
      triggers
    }, () => show('Triggers updated'));
  });

  buttons.remove.addEventListener('click', () => {
    for (const e of section.querySelectorAll('input[type=checkbox]:checked')) {
      e.closest('.trigger').remove();
    }
    const nodes = [...container.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    nodes.forEach(node => node.remove());
  });

  // lazy init: render rows on the first activation of this tab
  document.addEventListener('click', e => {
    if (e.target.dataset?.tab === 'triggers') {
      check();
    }
  });

  if (location.hash === '#triggers') {
    check();
  }
})();
