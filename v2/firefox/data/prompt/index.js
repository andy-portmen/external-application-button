'use strict';

const args = new URLSearchParams(location.search);
document.getElementById('message').textContent = args.get('message');

document.getElementById('cancel').addEventListener('click', () => {
  chrome.runtime.sendMessage({
    method: 'prompt-resolved'
  });
  window.close();
});
document.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  chrome.runtime.sendMessage({
    method: 'prompt-resolved',
    value: document.getElementById('input').value
  });
  window.close();
});

document.getElementById('input').addEventListener('input', e => {
  document.getElementById('ok').disabled = e.target.value === '';
});

window.addEventListener('blur', () => chrome.runtime.sendMessage({
  method: 'bring-to-front'
}));
window.onbeforeunload = () => chrome.runtime.sendMessage({
  method: 'prompt-resolved'
});

document.addEventListener('keyup', e => {
  if (e.code === 'Escape') {
    window.close();
  }
});

if (args.get('value')) {
  document.getElementById('input').value = args.get('value');
  document.getElementById('input').dispatchEvent(new Event('input'));
}
