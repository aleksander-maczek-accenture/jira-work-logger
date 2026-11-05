const queue = [];
let active = false;

function nextPrompt() {
  if (active || !queue.length) return;
  active = true;
  const { message, confirmation, options, resolve } = queue.shift();
  const previous = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'appPrompt';
  dialog.setAttribute('aria-labelledby', 'appPromptTitle');
  dialog.setAttribute('aria-describedby', 'appPromptMessage');
  dialog.innerHTML = `<div class="appPromptBody"><h2 id="appPromptTitle"></h2><p id="appPromptMessage"></p><div class="appPromptActions"><button type="button" class="secondaryBtn" data-cancel>Anuluj</button><button type="button" class="primaryBtn" data-accept></button></div></div>`;
  dialog.querySelector('h2').textContent = options.title || (confirmation ? 'Usunac worklog?' : 'Jira Worklogs');
  dialog.querySelector('p').textContent = String(message);
  const cancel = dialog.querySelector('[data-cancel]');
  const accept = dialog.querySelector('[data-accept]');
  cancel.hidden = !confirmation;
  accept.textContent = options.acceptLabel || (confirmation ? 'Usun worklog' : 'Rozumiem');
  accept.classList.toggle('dangerBtn', confirmation && options.danger !== false);
  let settled = false;
  const finish = value => {
    if (settled) return;
    settled = true;
    dialog.close();
    dialog.remove();
    active = false;
    if (previous?.isConnected) previous.focus();
    resolve(value);
    nextPrompt();
  };
  cancel.addEventListener('click', () => finish(false));
  accept.addEventListener('click', () => finish(true));
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
  document.body.append(dialog);
  dialog.showModal();
  (confirmation ? cancel : accept).focus();
}

function enqueue(message, confirmation, options = {}) {
  return new Promise(resolve => {
    queue.push({ message, confirmation, options, resolve });
    nextPrompt();
  });
}

export function showNotice(message) { return enqueue(message, false); }
export function askConfirmation(message, options = {}) { return enqueue(message, true, options); }
