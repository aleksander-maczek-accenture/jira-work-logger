// A visual-only easter egg. It never modifies worklogs or stored settings.
export function installBartekEasterEgg() {
  const sequence = 'bartek!!!';
  let buffer = '';
  let lastKeyAt = 0;
  let running = false;
  const faceUrl = new URL('./assets/bart-head.png', import.meta.url).href;

  function attack() {
    if (running || document.querySelector('dialog[open]')) return;
    running = true;
    const dialog = document.createElement('dialog');
    dialog.className = 'bartekRampage';
    dialog.setAttribute('aria-label', 'Godzilla Bartek atakuje. Escape zamyka animacje.');
    dialog.innerHTML = `
      <div class="rampageSky" aria-hidden="true"></div>
      <svg class="rampageCracks" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="#111827" stroke-width="2"><path d="m480 260-95-88-35-172m130 260 110-70 76-190M480 260l44 155-90 132 30 153M480 260 290 310 120 260 0 285M480 260l212 69 122 160 186 20M290 310l-42 135-105 40-40 215M590 190l126 14 100-77 184 8M524 415l151 37 70 161 130 87"/></g>
        <g fill="none" stroke="#ffffffbb" stroke-width="1"><path d="m484 261-95-88L354 0m130 261 110-70L670 0M484 261l44 155-90 132 30 152M484 261 294 311 124 261 0 289M484 261l212 69 122 160 182 24"/></g>
      </svg>
      <div class="rampageDebris" aria-hidden="true"></div>
      <div class="rampageMonster" aria-hidden="true">
        <svg viewBox="0 0 620 610">
          <defs><linearGradient id="bartekHide" x2="1" y2="1"><stop stop-color="#627345"/><stop offset="1" stop-color="#1d3427"/></linearGradient><clipPath id="bartekFace"><ellipse cx="310" cy="120" rx="69" ry="75"/></clipPath></defs>
          <path d="M300 500C182 532 112 488 18 411c23 103 126 161 278 145" fill="#263f2b" stroke="#15291d" stroke-width="5"/>
          <path d="m223 445-45-38 34-12-33-50 38 4-18-60 40 17-7-65 40 26 1-67 34 35 12-58 32 39" fill="#9baf6c" stroke="#243c28" stroke-width="4"/>
          <path d="M267 169c-48 35-44 87-41 128-29 66-40 148-20 197l-43 61 2 24h114l24-81 22-6 17 83h117l-7-27-46-55c27-96-14-192-43-237l12-80z" fill="url(#bartekHide)" stroke="#15291d" stroke-width="6"/>
          <path d="M287 262c-49 67-48 159-22 207 21 24 58 26 87-3 21-62 14-145-26-204" fill="#899270" opacity=".6"/>
          <path d="m253 240-66 41-40-10-13 20 59 28 87-40m68-45 64 39 45-8 15 21-62 28-75-39" fill="#3b5534" stroke="#15291d" stroke-width="5"/>
          <g fill="#d3d6af"><path d="m147 271-16-16 4 28m18-12-2-21 13 24m290-9 10-19 1 24m-16-3 0-20-12 23M174 554l-13 25h25l7-25m12 0-4 25h24l-3-25m139 1-6 24h25l-7-24m17 0 6 24h25l-14-24"/></g>
          <path d="M241 152c-19-44-18-96 22-122 30-24 80-15 102 15l35 57-13 68-45 37-61-9z" fill="#425d36" stroke="#15291d" stroke-width="5"/>
          <image href="${faceUrl}" x="235" y="37" width="150" height="166" preserveAspectRatio="xMidYMid slice" clip-path="url(#bartekFace)"/>
          <path d="m268 197 13 13 60 2 21-17" fill="none" stroke="#172e1e" stroke-width="8"/>
          <g stroke="#455b39" opacity=".55"><path d="m268 310 70 0m-80 22h89m-92 23h96m-98 23h100m-99 22h98m-91 23h86m-75 23h66"/></g>
        </svg>
      </div>
      <div class="rampageCaption"><strong>BARTEK!!!</strong><span>Kontrola worklogow wymknela sie spod kontroli.</span></div>
      <button type="button" class="rampageStop" autofocus>Zakoncz · Esc</button>`;
    const fragments = [...document.querySelectorAll('.appShell > .panel, .appHeader, .appShell > .tabs')];
    fragments.forEach((element, index) => {
      element.style.setProperty('--rampage-x', `${(index % 2 ? 1 : -1) * (40 + Math.random() * 100)}px`);
      element.style.setProperty('--rampage-y', `${25 + Math.random() * 100}px`);
      element.style.setProperty('--rampage-angle', `${(Math.random() - .5) * 12}deg`);
      element.style.setProperty('--rampage-delay', `${index * 45}ms`);
      element.classList.add('rampageFragment');
    });
    const debris = dialog.querySelector('.rampageDebris');
    for (let index = 0; index < 34; index += 1) {
      const shard = document.createElement('i');
      shard.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 75}%;--fall-x:${(Math.random() - .5) * 400}px;--fall-rotate:${Math.random() * 500}deg;--fall-delay:${Math.random() * .8}s;width:${15 + Math.random() * 55}px;height:${15 + Math.random() * 45}px;`;
      debris.append(shard);
    }
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      document.body.classList.remove('bartekRampageActive');
      fragments.forEach(element => {
        element.classList.remove('rampageFragment');
        ['--rampage-x','--rampage-y','--rampage-angle','--rampage-delay'].forEach(name => element.style.removeProperty(name));
      });
      if (dialog.open) dialog.close();
      dialog.remove();
      running = false;
      buffer = '';
    };
    dialog.querySelector('button').addEventListener('click', cleanup);
    dialog.addEventListener('cancel', event => { event.preventDefault(); cleanup(); });
    document.body.append(dialog);
    document.body.classList.add('bartekRampageActive');
    dialog.showModal();
    timer = setTimeout(cleanup, 8500);
  }

  document.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || running) return;
    if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')) { buffer = ''; return; }
    if (event.key.length !== 1) return;
    if (Date.now() - lastKeyAt > 4000) buffer = '';
    lastKeyAt = Date.now();
    buffer = (buffer + event.key.toLowerCase()).slice(-sequence.length);
    if (buffer === sequence) { buffer = ''; attack(); }
  });
}
