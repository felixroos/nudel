import { pastamirror, session } from './main.js';
import { nudelToast } from './toast.js';

const exportButton = document.querySelector('#export-button');
const exportDialog = document.querySelector('#export-dialog');
const exportCloseButton = document.querySelector('#export-close-button');

const exportCopyButton = document.querySelector('#export-copy-button');
const exportDownloadButton = document.querySelector('#export-download-button');
const exportOpenFlokButton = document.querySelector('#export-open-flok-button');
const exportOpenStrudelButton = document.querySelector('#export-open-strudel-button');
const exportOpenHydraButton = document.querySelector('#export-open-hydra-button');

exportButton.addEventListener('click', () => {
  exportDialog.showModal();
  exportOpenFlokButton.href = `https://${getFlokLink()}`;
  exportCloseButton.focus();
});

let stdSource = '';
fetch('/src/std.js').then(async (response) => {
  stdSource = await response.text();
});

export function getStdSource() {
  if (!stdSource) throw new Error('stdSource not loaded yet');
  return stdSource;
}

// Return the lines of a panel view.
function getDocumentText(view) {
  const doc = view.viewState.state.doc;
  return doc.children ? doc.children.flatMap((c) => c.text) : doc.text;
}

export function getFlokLink() {
  const prettyDate = getPrettyDate();
  const prefix = `// "nudel ${prettyDate}" @by pastagang\n`;

  const panels = [];
  const targets = [];
  pastamirror.currentEditors.forEach((it, key) => {
    panels.push(
      `${key == '1' ? prefix : ''}${getDocumentText(it.view).join('\n')}${key === '1' ? '\n\n\n' + stdSource : ''}`,
    );
    targets.push(it.doc.target);
  });
  return `flok.cc#targets=${targets.join(
    ',',
  )}&${panels.map((it, index) => `c${index}=${btoa(unescape(encodeURIComponent(it)))}`).join('&')}`;
}

export function copyToClipboard(txt, { message } = {}) {
  // Copy to the clipboard
  navigator.clipboard.writeText(txt);
  if (message) {
    nudelToast(`Copied ${message} to clipboard!`);
  } else {
    nudelToast('Copied to clipboard!');
  }
}

export function getPrettyDate() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

export function downloadAsFile(txt, { fileName = `nudel-export-${getPrettyDate()}.txt` } = {}) {
  // Download file
  var hiddenElement = document.createElement('a');
  hiddenElement.href = 'data:attachment/text,' + encodeURI(txt);
  hiddenElement.target = '_blank';
  hiddenElement.download = fileName;
  hiddenElement.click();
}

export function getCode(filter) {
  const prettyDate = getPrettyDate();
  const headline = `// "nudel ${prettyDate}" @by pastagang\n`;
  let documents = session.getDocuments();
  if (filter) {
    documents = documents.filter(filter);
  }
  return (
    documents.reduce((acc, doc) => `${acc}\n//pane ${doc.id}\n${doc.content || ''}`, headline) + '\n\n\n' + stdSource
  );
}

exportCopyButton.addEventListener('click', () => {
  const txt = getCode();
  copyToClipboard(txt, { message: 'code' });
});

exportDownloadButton.addEventListener('click', () => {
  const txt = getCode();
  downloadAsFile(txt);
});

export function unicodeToBase64(text) {
  const utf8Bytes = new TextEncoder().encode(text);
  const base64String = btoa(String.fromCharCode(...utf8Bytes));
  return base64String;
}
export function code2hash(code) {
  return encodeURIComponent(unicodeToBase64(code));
}

exportOpenStrudelButton.addEventListener('click', () => {
  const code = getCode((doc) => doc.target === 'strudel');
  window.open(`https://strudel.cc/#${code2hash(code)}`);
});

exportOpenHydraButton.addEventListener('click', () => {
  const code = getCode((doc) => doc.target === 'hydra');
  window.open(`https://hydra.ojack.xyz/?code=${code2hash(code)}`);
});
