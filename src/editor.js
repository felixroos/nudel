import { autocompletion, closeBrackets } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching } from '@codemirror/language';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { keymap, lineNumbers } from '@codemirror/view';
import { evalKeymap, flashField, remoteEvalFlash } from '@flok-editor/cm-eval';
import { vim } from '@replit/codemirror-vim';
import { highlightExtension } from '@strudel/codemirror';
import { EditorView, minimalSetup } from 'codemirror';
import { yCollab } from 'y-codemirror.next';
import { UndoManager } from 'yjs';
import './style.css';
import theme from './themes/strudel-theme.js';
import { highlightMiniLocations, updateMiniLocations } from '@strudel/codemirror';
import { getSettings } from './settings.js';
import { insertNewline } from '@codemirror/commands';
import { nudelAlert } from './alert.js';
import { strudelAutocomplete } from './strudel-autocomplete.js';

// we need to access these variables from the strudel iframe:
window.highlightMiniLocations = highlightMiniLocations; // we cannot import this for some reason
window.updateMiniLocations = updateMiniLocations; // we cannot import this for some reason

// dynamic codemirror extensions

export class PastaMirror {
  supportedTargets = ['strudel', 'hydra', 'shader', 'kabelsalat'];
  editorViews = new Map();
  currentEditors = new Map();
  extensions = {
    lineWrapping: (on) => (on ? EditorView.lineWrapping : []),
    lineNumbers: (on) => (on ? lineNumbers() : []),
    closeBrackets: (on) => (on ? closeBrackets() : []),
    strudelAutocomplete: (on) =>
      on ? autocompletion({ override: [strudelAutocomplete] }) : autocompletion({ override: [] }),
  };
  strudelOnlyExtensions = ['strudelAutocomplete']; // these extension keys are only active for strudel panes
  constructor() {
    this.compartments = Object.fromEntries(Object.keys(this.extensions).map((key) => [key, new Compartment()]));
  }
  createEditor(doc) {
    const initialSettings = Object.keys(this.compartments).map((key) => {
      const isStrudelOnly = this.strudelOnlyExtensions.includes(key);
      // disable strudel only extensions for other pane types
      const enabled = getSettings()[key] && (!isStrudelOnly || doc.target === 'strudel');
      const extension = this.extensions[key](enabled);
      return this.compartments[key].of(extension);
    });
    // console.log('createEditor', doc);
    if (!['1', '2', '3', '4', '5', '6', '7', '8'].includes(doc.id)) {
      console.warn(`ignoring doc with id "${doc.id}"`);
      return;
    }

    const state = EditorState.create({
      doc: doc.content,
      extensions: [
        minimalSetup,
        theme,
        this.flokBasicSetup(doc),
        javascript(),
        getSettings().vimMode ? vim() : [],
        bracketMatching({ brackets: '()[]{}<>' }),
        ...initialSettings,
        Prec.highest(
          keymap.of([
            // stop pane
            ...['Ctrl-.', 'Alt-.'].map((key) => ({
              key,
              run: () => {
                if (doc.target === 'strudel') {
                  doc.evaluate('$: silence', { from: null, to: null });
                } else if (doc.target === 'kabelsalat') {
                  doc.evaluate('n(0).out()', { from: null, to: null });
                  if (window.strudel) {
                    window.strudel.setDocPattern(doc.id, window.strudelWindow.silence);
                  }
                } else if (doc.target === 'hydra') {
                  console.log('todo: implement hydra stop command');
                }
                return true;
              },
            })),
            // chat current line..
            ...['Shift-Enter'].map((key) => ({
              key,
              run: (view) => {
                let from = view.state.selection.main.from;
                let to = view.state.selection.main.to;

                // if there is no selection, delete the current line
                // if there is a selection, delete the selection
                if (view.state.selection.main.empty) {
                  const { head } = view.state.selection.main;
                  const line = view.state.doc.lineAt(head);
                  from = line.from;
                  to = line.to + 1;
                }

                const message = view.state.sliceDoc(from, to).trim();
                doc.session._pubSubClient.publish(`session:pastagang:chat`, {
                  docId: doc.id,
                  message,
                  user: doc.session.user,
                  from,
                });

                const transaction = view.state.update({
                  changes: { from, to, insert: '' },
                });
                view.dispatch(transaction);
                return true;
              },
            })),
            // overrides Enter to disable auto indenting..
            // feel free to remove this again if it annoys you
            // this is GREAT
            {
              key: 'Enter',
              run: (view) => {
                insertNewline(view);
                return true;
              },
            },
            {
              // any key except Ctrl-? or Shift-? or etc
              any: (_view, key) => {
                if (!getSettings().pastingMode) return false;
                if (key.ctrlKey || key.altKey || key.metaKey) {
                  return false;
                }

                const allowlist = [
                  'Enter',
                  'Backspace',
                  'Delete',
                  'ArrowUp',
                  'ArrowDown',
                  'ArrowLeft',
                  'ArrowRight',
                  'Shift-ArrowRight',
                  'Shift-ArrowLeft',
                  'Shift-ArrowUp',
                  'Shift-ArrowDown',
                  'Shift',
                  'Escape',
                ];

                if (allowlist.includes(key.key)) {
                  return false;
                }

                if (getSettings().vimMode) {
                  nudelAlert(
                    "<h2>typing is disabled</h2><p>but you're mad enough to use vim mode anyway so i'll let this one slide...</p>",
                  );
                  return false;
                }

                nudelAlert(
                  '<h2>typing is disabled</h2><p>to enable typing, turn off <strong>PASTING MODE</strong> in the settings.</p>',
                );
                return true;
              },
            },
          ]),
        ),
      ],
    });

    const slotsEl = document.querySelector('.slots');

    const side = parseInt(doc.id) % 2 == 0 ? 'right' : 'left';

    slotsEl.insertAdjacentHTML(
      'beforeend',
      `<div class="slot ${side}" id="slot-${doc.id}">
      <header>
        <select class="target">
          ${this.supportedTargets.map((target) => `<option value="${target}">${target}</option>`).join('\n')}
        </select>
        <button class="run">▶run</button>
      </header>
    <div class="editor"></div>
  </div>`,
    );

    const tabsEl = document.querySelector(`.tabs .${side}`);
    tabsEl.insertAdjacentHTML(
      'beforeend',
      `<button class="tab ${side}" id="tab-${doc.id}">
            ${doc.id} ${doc.target}
      </button>`,
    );

    document.querySelector(`#tab-${doc.id}`).addEventListener('click', () => {
      tabsEl.querySelectorAll('.tab').forEach((tab) => {
        tab.classList.remove('active');
      });
      document.querySelector(`#tab-${doc.id}`).classList.add('active');
      this.editorViews.get(doc.id)?.focus();

      slotsEl.querySelectorAll(`.slot.${side}`).forEach((slot) => {
        slot.classList.remove('active');
      });
      slotsEl.querySelector(`#slot-${doc.id}`).classList.add('active');
    });

    const editorEl = document.querySelector(`#slot-${doc.id} .editor`);
    const view = new EditorView({
      state,
      parent: editorEl,
    });
    this.editorViews.set(doc.id, view);

    const targetEl = document.querySelector(`#slot-${doc.id} .target`);
    if (!this.supportedTargets.includes(doc.target)) {
      targetEl.insertAdjacentHTML('beforeend', `<option value="${doc.target}">? ${doc.target} ?</option>`);
      console.warn(`unsupported target "${doc.target}" in doc "${doc.id}". evaluations will be ignored`);
    }
    targetEl.value = doc.target;

    targetEl.addEventListener('change', (e) => {
      doc.target = e.target.value;
    });
    doc.session.on(`change-target:${doc.id}`, () => {
      targetEl.value = doc.target;
    });

    const runButton = document.querySelector(`#slot-${doc.id} .run`);
    runButton.addEventListener('click', () => {
      doc.evaluate(doc.content, { from: 0, to: doc.content.length });
    });

    this.currentEditors.set(doc.id, { state, doc, view });
  }
  flokBasicSetup(doc) {
    doc.collabCompartment = new Compartment(); // yeah this is dirty
    const text = doc.getText();
    const undoManager = new UndoManager(text);
    const web = true;

    // TODO: automatically set scrollIntoView, based on mode
    // set to true in boxed mode, but only when boxed mode is actually visible
    // we don't want cursor tracking on mobile!
    const scrollIntoView = getSettings().trackRemoteCursors;
    const collab = yCollab(text, doc.session.awareness, {
      undoManager,
      showLocalCaret: true,
      scrollIntoView,
    });
    return [
      flashField(),
      highlightExtension,
      remoteEvalFlash(doc),
      Prec.high(evalKeymap(doc, { web, defaultMode: 'document' })),
      //collab,
      doc.collabCompartment.of(collab),
    ];
  }
  deleteEditor(id) {
    this.editorViews.delete(id);
    this.currentEditors.delete(id);
    document.querySelector(`#slot-${id}`).remove();
  }
  reconfigureExtension(key, value, view) {
    view.dispatch({
      effects: this.compartments[key].reconfigure(this.extensions[key](value)),
    });
  }
  enableRemoteCursorTracking(session) {
    const docs = session.getDocuments();
    console.log('enable', docs);

    docs.forEach((doc) => {
      const collab = yCollab(text, doc.session.awareness, {
        undoManager,
        showLocalCaret: true,
        scrollIntoView: true,
      });
      // const ext = doc.collabCompartment.of(collab);

      view.dispatch({
        effects: doc.collabCompartment.reconfigure(collab),
      });
    });

    // walk over
    /* view.dispatch({
      effects: this.reconfigure(this.extensions[key](value)),
    }); */
  }
  disableRemoteCursorTracking(session) {
    console.log('disable', session); /* view.dispatch({
      effects: this.reconfigure(this.extensions[key](value)),
    }); */
  }

  updateExtensions(settings, appliedSettings) {
    const keys = Object.keys(this.extensions);
    for (let index in keys) {
      const key = keys[index];
      for (let [_, view] of this.editorViews) {
        if (settings[key] !== appliedSettings[key]) {
          // console.log('reconfigure', key, settings[key]);
          this.reconfigureExtension(key, settings[key], view);
        }
      }
    }
  }

  chat(message) {
    const view = this.editorViews.get(message.docId);
    const pos = view.coordsAtPos(message.from);
    const chatContainer = document.querySelector('.chat-container');
    if (pos) {
      const messageContainer = document.createElement('div');
      messageContainer.innerText = message.message;
      messageContainer.style = `position:fixed;top:${pos.top}px;left:${pos.left}px`;
      messageContainer.classList.add('rising-animation');
      messageContainer.classList.add('message-container');
      chatContainer.appendChild(messageContainer);
      setTimeout(() => {
        messageContainer.remove();
      }, 7000);
    } else {
      console.warn('could not get line position');
    }
  }
}
