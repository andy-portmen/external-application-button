const args = new URLSearchParams(location.search);

chrome.runtime.sendMessage({
  method: 'execute',
  id: args.get('key'),
  href: args.get('href'),
  selectionText: ''
}, () => history.back());
