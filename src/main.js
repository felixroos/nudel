import { nudelAlert } from './alert.js';
import { applySettingsToNudel, getSettings } from './settings.js';
import { PastaMirror } from './editor.js';
import './style.css';
import { updateMiniLocations } from '@strudel/codemirror';
import { getSession } from './session.js';

export const pastamirror = new PastaMirror();
window.editorViews = pastamirror.editorViews;

export const Frame = {
  hydra: document.getElementById('hydra'),
  shader: document.getElementById('shader'),
  strudel: document.getElementById('strudel'),
  kabesalat: document.getElementById('kabelsalat'),
};

applySettingsToNudel();

// is in development mode?
export function isDevelopmentEnvironment() {
  return window.location.hostname === 'localhost';
}

// Reveal all development elements in development
if (isDevelopmentEnvironment()) {
  const elements = document.querySelectorAll('.development');
  elements.forEach((el) => el.classList.remove('development'));
}

//=======================================================================================
// Hello. If you've come here to re-enable paste, then please think carefully.
// Paste has been disabled as an experiment, to see if it affects various things.
//
// - Perhaps disabling paste can lower the overall quality and cleanliness of our code
//   ... which might help to lower standards, and encourage more people to make stuff.
//           It could help people to worry less, and "just type".
//
// - Paste allows people to force certain things to exist for a long time.
//   ... which can give too much power to keen individuals.
//          Let's disable paste for a while, to see if it encourages new trends to form.
//
// - Paste can be a crutch for me during learning.
//   ... I learn much better when I have to manually type things out.
//           Perhaps disabling paste can help me and others to learn better.
//
// - If paste is an option, we'll be tempted to build tools and languages that rely on it.
//    ... I think we should build tools that are optimised for manual typing.
//
// - By disabling paste, we prioritise being in the moment, and creating with others in the open.
//=======================================================================================
addEventListener(
  'paste',
  (e) => {
    if (getSettings().pastingMode) return;
    e.preventDefault();
    nudelAlert(
      '<h2>pasting is disabled</h2><p>to enable pasting, turn on <strong>PASTING MODE</strong> in the settings.</p>',
    );
  },
  { passive: false, capture: true },
);

// add / remove panes
document.getElementById('add-pane-button')?.addEventListener('click', () => {
  const session = getSession();
  if (!session) return;
  const documents = session.getDocuments();
  if (documents.length >= 8) {
    console.error('cannot add more than 8 panes');
    return;
  }
  const nextID = [1, 2, 3, 4, 5, 6, 7, 8].find((number) => !documents.find((doc) => Number(doc.id) === number));
  const newDocs = [
    ...documents.map((doc) => ({ id: doc.id, target: doc.target })),
    { id: nextID + '', target: 'strudel' },
  ];
  session.setActiveDocuments(newDocs);
});
document.getElementById('remove-pane-button')?.addEventListener('click', () => {
  const session = getSession();
  if (!session) return;
  const documents = session.getDocuments();
  session.setActiveDocuments([...documents.map((doc) => ({ id: doc.id, target: doc.target })).slice(0, -1)]);
});

// highlights
export function clearStrudelHighlights() {
  for (const view of pastamirror.editorViews.values()) {
    updateMiniLocations(view, []);
  }
}
