'use strict';

const args = new URLSearchParams(location.search);
document.getElementById('message').textContent = args.get('message');

const port = chrome.runtime.connect({name: 'prompt'});

document.getElementById('cancel').addEventListener('click', () => {
  window.close();
});
document.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  port.postMessage(document.getElementById('input').value);
  window.close();
});

document.getElementById('input').addEventListener('input', e => {
  document.getElementById('ok').disabled = e.target.value === '';
});

window.addEventListener('blur', () => chrome.runtime.sendMessage({
  method: 'bring-to-front'
}));

document.addEventListener('keyup', e => {
  if (e.code === 'Escape') {
    window.close();
  }
});

if (args.get('value')) {
  document.getElementById('input').value = args.get('value');
  document.getElementById('input').dispatchEvent(new Event('input'));
}
