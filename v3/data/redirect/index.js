const args = new URLSearchParams(location.search);

chrome.runtime.sendMessage({
  method: 'execute',
  id: args.get('key'),
  // https://github.com/andy-portmen/external-application-button/issues/74
  href: location.search.replace(/^[^&]*&href=/, ''),
  selectionText: ''
}, () => history.back());
