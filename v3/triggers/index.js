let id;

function show(msg) {
  const toast = document.getElementById('toast');
  clearTimeout(id);
  toast.textContent = msg;
  id = setTimeout(() => toast.textContent = '', 5000);
}

chrome.storage.local.get({
  apps: {},
  triggers: []
}, prefs => {
  const apps = Object.entries(prefs.apps);

  if (apps.length === 0) {
    alert('Add new apps from the options page, then reopen this tab');
    return;
  }
  const template = document.getElementById('trigger');
  for (const [id, {name}] of apps) {
    const option = document.createElement('option');
    option.textContent = name;
    option.value = id;

    template.content.querySelector('.name').append(option);
  }

  document.getElementById('add').disabled = false;

  for (const trigger of prefs.triggers) {
    const node = document.importNode(template.content, true);
    node.querySelector('.name').value = trigger.id;
    node.querySelector('.action').value = trigger.action;
    node.querySelector('textarea').value = trigger.js;
    if (trigger.action === 'js') {
      node.querySelector('textarea').disabled = false;
    }
    document.getElementById('triggers').append(node);
  }
});

document.getElementById('add').onclick = () => {
  const template = document.getElementById('trigger');
  const node = document.importNode(template.content, true);
  document.getElementById('triggers').append(node);
};

document.onchange = e => {
  // remove button
  const s = document.querySelector('input[type=checkbox]:checked');
  document.getElementById('remove').disabled = !s;
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
};

document.getElementById('shortcuts').onclick = () => chrome.tabs.create({
  url: 'chrome://extensions/shortcuts'
});

document.getElementById('save').onclick = () => {
  const triggers = [];
  for (const e of document.querySelectorAll('.trigger')) {
    triggers.push({
      id: e.querySelector('.name').value,
      action: e.querySelector('.action').value,
      js: e.querySelector('textarea').value
    });
  }
  chrome.storage.local.set({
    triggers
  }, () => {
    show('Triggers updated');
  });
};


document.getElementById('remove').onclick = () => {
  for (const e of document.querySelectorAll('input[type=checkbox]:checked')) {
    e.closest('.trigger').remove();
  }
  const triggers = document.getElementById('triggers');
  const nodes = [];
  for (const node of triggers.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      nodes.push(node);
    }
  }
  nodes.forEach(node => node.remove());
};
