/*! Schood AI website widgets for education centres (C8, C14): the admissions chat
 * and the placement test. Add to a centre's website:
 *   <script src="https://ai.schood.online/embed/widget.js" data-centre="KEY" data-api="API" async></script>
 *   <div data-schood-placement></div>
 *   <script src="https://ai.schood.online/embed/widget.js" data-centre="KEY" data-widget="placement" data-api="API" async></script>
 * The widget talks to Schood through a hidden bridge page on ai.schood.online
 * (embed/bridge.html), which names this website to Schood; Schood answers only
 * websites the centre allowed. Everything renders in a shadow root as text (never
 * HTML from the server). No cookies; one random session id per browser in localStorage. */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute('data-centre') || '';
  var api = (script.getAttribute('data-api') || '').replace(/\/+$/, '');
  var mode = script.getAttribute('data-widget') === 'placement' ? 'placement' : 'chat';
  // The Schood AI function: HTTPS only, except a local dev stack on this machine.
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(key) || !/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)/.test(api + '/')) return;
  var docLang = (document.documentElement.lang || navigator.language || 'uz').slice(0, 2).toLowerCase();
  var lang = docLang === 'ru' ? 'ru' : docLang === 'en' ? 'en' : 'uz';
  var T = {
    uz: { open: 'Savol berish', close: 'Yopish', send: 'Yuborish', placeholder: 'Xabaringizni yozing…', error: 'Ulanib bo‘lmadi. Birozdan keyin urinib ko‘ring.', off: 'Bu xizmat hozircha o‘chirilgan.', typing: 'Yozmoqda…', start: 'Testni boshlash', name: 'Ismingiz', phone: 'Telefon raqamingiz', submit: 'Yakunlash', result: 'Taxminiy darajangiz', confirm: 'Darajangizni o‘qituvchi tasdiqlaydi.', words: 'so‘z', questions: 'savol', minutes: 'daqiqa' },
    ru: { open: 'Задать вопрос', close: 'Закрыть', send: 'Отправить', placeholder: 'Напишите сообщение…', error: 'Не удалось связаться. Попробуйте чуть позже.', off: 'Сервис сейчас выключен.', typing: 'Печатает…', start: 'Начать тест', name: 'Ваше имя', phone: 'Ваш телефон', submit: 'Завершить', result: 'Ваш примерный уровень', confirm: 'Уровень подтвердит преподаватель.', words: 'слов', questions: 'вопросов', minutes: 'минут' },
    en: { open: 'Ask us', close: 'Close', send: 'Send', placeholder: 'Write your message…', error: 'Could not connect. Please try again soon.', off: 'This is switched off right now.', typing: 'Typing…', start: 'Start the test', name: 'Your name', phone: 'Your phone', submit: 'Finish', result: 'Your estimated level', confirm: 'A teacher will confirm your level.', words: 'words', questions: 'questions', minutes: 'minutes' },
  }[lang];
  var LEVEL = { pre_a1: 'Pre-A1', a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2', c1: 'C1', c2: 'C2' };

  function session() {
    var name = 'schood-embed-' + key;
    try {
      var stored = localStorage.getItem(name);
      if (stored && /^[A-Za-z0-9_-]{16,64}$/.test(stored)) return stored;
    } catch (e) { /* storage blocked: a session for this page view */ }
    var bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    var id = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    try { localStorage.setItem(name, id); } catch (e) { /* ignore */ }
    return id;
  }
  var sid = session();

  // Calls go through a hidden bridge page on Schood's own site (bridge.html next to this
  // script). The browser tells the bridge which website is asking (postMessage origin), and
  // Schood answers only the websites the centre allowed.
  var bridgeUrl = new URL('bridge.html?api=' + encodeURIComponent(api), script.src);
  var bridgeOrigin = bridgeUrl.origin;
  var frame = document.createElement('iframe');
  frame.src = bridgeUrl.href;
  frame.title = 'Schood';
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  var pending = {}, seq = 0, markReady;
  var ready = new Promise(function (resolve) { markReady = resolve; });
  window.addEventListener('message', function (event) {
    if (event.origin !== bridgeOrigin || event.source !== frame.contentWindow) return;
    var data = event.data;
    if (!data || data.schood !== 'embed') return;
    if (data.ready) { markReady(); return; }
    var waiting = pending[data.id];
    if (!waiting) return;
    delete pending[data.id];
    if (data.ok) waiting.resolve(data.data || {});
    else { var err = new Error((data.data && data.data.code) || 'error'); err.code = data.data && data.data.code; waiting.reject(err); }
  });
  (document.body || document.documentElement).appendChild(frame);
  function call(op, body) {
    return ready.then(function () {
      return new Promise(function (resolve, reject) {
        var id = ++seq;
        pending[id] = { resolve: resolve, reject: reject };
        frame.contentWindow.postMessage({ schood: 'embed', id: id, op: op, key: key, lang: lang, body: body ? Object.assign({ session: sid }, body) : null }, bridgeOrigin);
        setTimeout(function () { if (pending[id]) { delete pending[id]; var err = new Error('timeout'); err.code = 'timeout'; reject(err); } }, 45000);
      });
    });
  }
  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    for (var name in attrs || {}) if (Object.prototype.hasOwnProperty.call(attrs, name)) node.setAttribute(name, attrs[name]);
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  var SAFE = /^#[0-9a-f]{6}$/i;
  function styles(color) {
    var c = SAFE.test(color || '') ? color : '#0f172a';
    return ':host{all:initial}*{box-sizing:border-box;font-family:Manrope,system-ui,-apple-system,"Segoe UI",sans-serif}[hidden]{display:none!important}' +
      '.launch{position:fixed;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:8px;min-height:48px;padding:0 18px;border:0;border-radius:999px;background:' + c + ';color:#fff;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(15,23,42,.25)}' +
      '.launch img{width:28px;height:28px;border-radius:50%;background:#fff;object-fit:cover}' +
      '.panel{position:fixed;bottom:84px;z-index:2147483000;display:flex;flex-direction:column;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 110px));border:1px solid #1f2937;border-radius:24px;background:#fbfaf7;color:#111827;overflow:hidden;box-shadow:0 16px 40px rgba(15,23,42,.3)}' +
      '.head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:' + c + ';color:#fff}.head strong{flex:1;font-size:15px}.head button{border:0;background:transparent;color:#fff;font-size:20px;cursor:pointer;width:36px;height:36px;border-radius:50%}' +
      '.log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:1.45}' +
      '.msg{max-width:85%;padding:8px 12px;border-radius:16px;white-space:pre-wrap;word-wrap:break-word}.me{align-self:flex-end;background:' + c + ';color:#fff}.them{align-self:flex-start;background:#fff;border:1px solid #e5e7eb}' +
      '.chips{display:flex;flex-wrap:wrap;gap:6px}.chips button{border:1px solid ' + c + ';background:#fff;color:#111827;border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer}' +
      'form.send{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}form.send input{flex:1;min-width:0;border:1px solid #d1d5db;border-radius:12px;padding:10px;font-size:14px}' +
      'button.primary{border:0;border-radius:999px;background:' + c + ';color:#fff;font-weight:700;padding:10px 16px;font-size:14px;cursor:pointer}button.primary[disabled]{opacity:.6;cursor:default}' +
      ':focus-visible{outline:2px solid #0f172a;outline-offset:2px}.note{font-size:12px;color:#4b5563}' +
      '.card{border:1px solid #1f2937;border-radius:24px;background:#fbfaf7;color:#111827;padding:20px;max-width:720px}' +
      '.card h2{margin:0 0 6px;font-size:20px}.q{margin:16px 0;padding:0;border:0}.q legend,.q label.p{font-weight:700;font-size:14px;margin-bottom:8px;display:block}' +
      '.opt{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;margin:6px 0;border:1px solid #e5e7eb;border-radius:14px;background:#fff;font-size:14px;cursor:pointer}' +
      '.card input[type=text],.card input[type=tel],.card textarea{width:100%;border:1px solid #d1d5db;border-radius:12px;padding:10px;font-size:14px;font-family:inherit}.card textarea{min-height:140px}' +
      '.field{margin:10px 0}.field span{display:block;font-size:13px;font-weight:700;margin-bottom:4px}.result{font-size:18px;font-weight:700}';
  }

  function mountChat(config) {
    var host = el('div', { 'data-schood-widget': 'chat' });
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: 'open' });
    root.appendChild(el('style', {}, styles(config.primary_color)));
    var side = config.position === 'left' ? 'left:20px' : 'right:20px';
    var launch = el('button', { type: 'button', class: 'launch', style: side, 'aria-expanded': 'false', 'aria-controls': 'schood-panel' });
    var picture = config.avatar_url || config.logo_url;
    if (picture && /^https:\/\//.test(picture)) launch.appendChild(el('img', { src: picture, alt: '', referrerpolicy: 'no-referrer' }));
    launch.appendChild(el('span', {}, config.launcher_label || T.open));
    var panel = el('div', { id: 'schood-panel', class: 'panel', role: 'dialog', 'aria-label': config.assistant_name, style: side, hidden: '' });
    var head = el('div', { class: 'head' });
    head.appendChild(el('strong', {}, config.assistant_name));
    var close = el('button', { type: 'button', 'aria-label': T.close }, '×');
    head.appendChild(close);
    var log = el('div', { class: 'log', 'aria-live': 'polite' });
    var form = el('form', { class: 'send' });
    var input = el('input', { type: 'text', maxlength: '2000', 'aria-label': T.placeholder, placeholder: T.placeholder, autocomplete: 'off' });
    var send = el('button', { type: 'submit', class: 'primary' }, T.send);
    form.appendChild(input); form.appendChild(send);
    panel.appendChild(head); panel.appendChild(log); panel.appendChild(form);
    root.appendChild(launch); root.appendChild(panel);
    var lastId = 0, timer = null, busy = false;
    function add(text, who, buttons) {
      var m = el('div', { class: 'msg ' + (who === 'me' ? 'me' : 'them') }, text);
      log.appendChild(m);
      if (buttons && buttons.length) {
        var chips = el('div', { class: 'chips' });
        buttons.forEach(function (b) { var chip = el('button', { type: 'button' }, b.label); chip.addEventListener('click', function () { say(b.data, b.label); }); chips.appendChild(chip); });
        log.appendChild(chips);
      }
      log.scrollTop = log.scrollHeight;
    }
    function say(text, shown) {
      if (busy || !text) return;
      busy = true; send.disabled = true;
      if (shown !== false) add(shown || text, 'me');
      var typing = el('div', { class: 'msg them note' }, T.typing); log.appendChild(typing);
      call('chat', { message: text }).then(function (data) {
        typing.remove();
        (data.messages || []).forEach(function (m) { add(m.text, 'them', m.buttons); });
        if (data.last_id) lastId = data.last_id;
      }).catch(function (e) { typing.remove(); add(e.code === 'widget_off' ? T.off : T.error, 'them'); })
        .then(function () { busy = false; send.disabled = false; input.focus(); });
    }
    function poll() {
      call('poll', { after: lastId }).then(function (data) {
        (data.messages || []).forEach(function (m) { if (m.id > lastId) { lastId = m.id; if (m.role === 'staff') add(m.text, 'them'); } });
      }).catch(function () { /* next poll */ });
    }
    function toggle(open) {
      if (open) { panel.removeAttribute('hidden'); launch.setAttribute('aria-expanded', 'true'); input.focus(); timer = setInterval(poll, 10000); if (!log.childNodes.length) say('menu:start', false); }
      else { panel.setAttribute('hidden', ''); launch.setAttribute('aria-expanded', 'false'); clearInterval(timer); launch.focus(); }
    }
    launch.addEventListener('click', function () { toggle(panel.hasAttribute('hidden')); });
    close.addEventListener('click', function () { toggle(false); });
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });
    form.addEventListener('submit', function (e) { e.preventDefault(); var text = input.value.trim(); if (!text) return; input.value = ''; say(text); });
  }

  function mountPlacement(config) {
    var slot = document.querySelector('[data-schood-placement]');
    if (!slot || !config.placement) return;
    var root = slot.attachShadow ? slot.attachShadow({ mode: 'open' }) : slot;
    root.appendChild(el('style', {}, styles(config.primary_color)));
    var card = el('div', { class: 'card' });
    root.appendChild(card);
    var attempt = null, answers = {};
    function intro() {
      card.textContent = '';
      card.appendChild(el('h2', {}, config.placement.title));
      card.appendChild(el('p', { class: 'note' }, config.placement.questions + ' ' + T.questions + (config.placement.minutes ? ' · ' + config.placement.minutes + ' ' + T.minutes : '')));
      var form = el('form', {});
      var nameField = el('label', { class: 'field' }); nameField.appendChild(el('span', {}, T.name)); var name = el('input', { type: 'text', maxlength: '120', required: '', autocomplete: 'name' }); nameField.appendChild(name);
      var phoneField = el('label', { class: 'field' }); phoneField.appendChild(el('span', {}, T.phone)); var phone = el('input', { type: 'tel', maxlength: '30', autocomplete: 'tel' }); phoneField.appendChild(phone);
      var go = el('button', { type: 'submit', class: 'primary' }, T.start);
      form.appendChild(nameField); form.appendChild(phoneField); form.appendChild(go);
      form.addEventListener('submit', function (e) {
        e.preventDefault(); go.disabled = true;
        call('placement', { step: 'start', name: name.value.trim(), phone: phone.value.trim() }).then(function (data) { attempt = data.attempt_id; questions(data.test); })
          .catch(function (err) { go.disabled = false; card.appendChild(el('p', { role: 'alert' }, err.code === 'widget_off' ? T.off : T.error)); });
      });
      card.appendChild(form);
    }
    var saveTimer = null;
    function save() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { call('placement', { step: 'answer', attempt_id: attempt, answers: answers }).catch(function () {}); }, 1000); }
    function questions(test) {
      card.textContent = '';
      card.appendChild(el('h2', {}, test.title));
      if (test.instructions) card.appendChild(el('p', {}, test.instructions));
      var form = el('form', {});
      var n = 0;
      test.sections.forEach(function (sec) {
        form.appendChild(el('h3', {}, sec.title));
        if (sec.kind === 'objective') {
          sec.items.forEach(function (item) {
            n++;
            if (item.type === 'mcq') {
              var fs = el('fieldset', { class: 'q' }); fs.appendChild(el('legend', {}, n + '. ' + item.prompt));
              (item.options || []).forEach(function (option, i) {
                var label = el('label', { class: 'opt' }); var radio = el('input', { type: 'radio', name: item.id, value: String(i) });
                radio.addEventListener('change', function () { answers[item.id] = i; save(); });
                label.appendChild(radio); label.appendChild(document.createTextNode(String.fromCharCode(65 + i) + '. ' + option)); fs.appendChild(label);
              });
              form.appendChild(fs);
            } else {
              var wrap = el('div', { class: 'q' }); var id = 'g-' + item.id;
              wrap.appendChild(el('label', { class: 'p', for: id }, n + '. ' + item.prompt));
              var gap = el('input', { type: 'text', id: id, maxlength: '120', autocomplete: 'off' });
              gap.addEventListener('input', function () { answers[item.id] = gap.value; save(); });
              wrap.appendChild(gap); form.appendChild(wrap);
            }
          });
        } else {
          var box = el('div', { class: 'q' }); var tid = 't-' + sec.id;
          box.appendChild(el('label', { class: 'p', for: tid }, sec.prompt || sec.title));
          var area = el('textarea', { id: tid, maxlength: '6000' });
          var count = el('p', { class: 'note' }, '0 ' + T.words);
          area.addEventListener('input', function () { answers[sec.id] = area.value; count.textContent = (area.value.trim().split(/\s+/).filter(Boolean).length) + ' ' + T.words; save(); });
          box.appendChild(area); box.appendChild(count); form.appendChild(box);
        }
      });
      var done = el('button', { type: 'submit', class: 'primary' }, T.submit);
      form.appendChild(done);
      form.addEventListener('submit', function (e) {
        e.preventDefault(); done.disabled = true; clearTimeout(saveTimer);
        call('placement', { step: 'answer', attempt_id: attempt, answers: answers })
          .then(function () { return call('placement', { step: 'submit', attempt_id: attempt }); })
          .then(function (data) { result(data); })
          .catch(function () { done.disabled = false; form.appendChild(el('p', { role: 'alert' }, T.error)); });
      });
      card.appendChild(form);
    }
    function result(data) {
      card.textContent = '';
      card.appendChild(el('h2', {}, config.placement.title));
      card.appendChild(el('p', { class: 'result', role: 'status' }, T.result + ': ' + (LEVEL[data.level] || '—') + (data.total ? ' (' + data.correct + '/' + data.total + ')' : '')));
      card.appendChild(el('p', { class: 'note' }, data.note || T.confirm));
    }
    intro();
  }

  call('config').then(function (config) {
    if (mode === 'placement') mountPlacement(config);
    else if (config.widgets && config.widgets.admissions_chat) mountChat(config);
  }).catch(function () { /* the centre's site keeps working without the widget */ });
})();
