(function(){
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  // Historical Enigma I rotor wirings and notches
  const ROTORS = {
    I:   { wiring:"EKMFLGDQVZNTOWYHXUSPAIBRCJ", notch:"Q" },
    II:  { wiring:"AJDKSIRUXBLHWTMCQGZNPYFVOE", notch:"E" },
    III: { wiring:"BDFHJLCPRTXVZNYEIWGAKMUSQO", notch:"V" },
    IV:  { wiring:"ESOVPZJAYQUIRHXLNFTGKDCMWB", notch:"J" },
    V:   { wiring:"VZBRGITYUPSDNHLXAWMJQOFECK", notch:"Z" },
  };
  const REFLECTOR_B = "YRUHQSLDPXNGOKMIEBFZCWVJAT";
  // "Perfect" reflector — a custom involution that, unlike every real Enigma reflector,
  // allows a handful of letters (J, Q, X, Z) to encrypt to themselves. Real reflectors were
  // wired from cable pairs with no letter ever wired back to its own contact — that structural
  // gap is exactly what let Bletchley Park's cribs work. This reflector patches it while staying
  // a valid involution, so encryption/decryption is still perfectly symmetric.
  const REFLECTOR_PERFECT = "BADCFEHGKJIMLONRQPTSVUYXWZ";
  const REFLECTORS = {
    B: { wiring: REFLECTOR_B, label: "B — Historical (has the No-Self flaw)" },
    P: { wiring: REFLECTOR_PERFECT, label: "Perfect — No-Self flaw removed" }
  };

  // ===== State =====
  let state = {
    rotorTypes: ["I","II","III"],      // left, mid, right
    ringSettings: [1,1,1],             // 1-26
    positions: [0,0,0],                // 0-25 (A-Z) current window letter, left/mid/right
    plugPairs: {},                      // letter -> letter map (both directions)
    reflector: "P"                      // default to the fixed reflector
  };

  const KEY_ROWS = [
    "QWERTZUIO".split(""),
    "ASDFGHJK".split(""),
    "PYXCVBNML".split("")
  ];
  // Lampboard uses same visual rows as historical Enigma lampboard layout (QWERTZ)
  const LAMP_ROWS = KEY_ROWS;
  const PLUG_ROWS = [
    "ABCDEFGHI".split(""),
    "JKLMNOPQR".split(""),
    "STUVWXYZ".split("")
  ];

  // ===== Build UI: Rotor bay =====
  const rotorBay = document.getElementById('rotorBay');
  const rotorLetterEls = [];
  const rotorSelectGroups = [[], [], []]; // synced <select> elements per rotor index (main bay + message panel)

  function setRotorType(idx, value){
    state.rotorTypes[idx] = value;
    rotorSelectGroups[idx].forEach(sel=>{ if(sel.value !== value) sel.value = value; });
  }

  function createRotorTypeSelect(idx, compact){
    const select = document.createElement('select');
    select.className = 'rotor-select';
    Object.keys(ROTORS).forEach(r=>{
      const opt = document.createElement('option');
      opt.value = r; opt.textContent = compact ? r : ("Rtr "+r);
      if(r === state.rotorTypes[idx]) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', ()=> setRotorType(idx, select.value));
    rotorSelectGroups[idx].push(select);
    return select;
  }

  ["Left","Middle","Right"].forEach((label, idx) => {
    const unit = document.createElement('div');
    unit.className = 'rotor-unit';

    const select = createRotorTypeSelect(idx, false);

    const ringRow = document.createElement('div');
    ringRow.className = 'ring-row';
    const ringMinus = document.createElement('button');
    ringMinus.className = 'ring-btn'; ringMinus.textContent = '−';
    const ringVal = document.createElement('div');
    ringVal.className = 'ring-val'; ringVal.textContent = String(state.ringSettings[idx]).padStart(2,'0');
    const ringPlus = document.createElement('button');
    ringPlus.className = 'ring-btn'; ringPlus.textContent = '+';
    ringMinus.addEventListener('click', ()=>{
      state.ringSettings[idx] = ((state.ringSettings[idx]-1+26-1)%26)+1;
      ringVal.textContent = String(state.ringSettings[idx]).padStart(2,'0');
    });
    ringPlus.addEventListener('click', ()=>{
      state.ringSettings[idx] = (state.ringSettings[idx]%26)+1;
      ringVal.textContent = String(state.ringSettings[idx]).padStart(2,'0');
    });
    ringRow.append(ringMinus, ringVal, ringPlus);

    const windowFrame = document.createElement('div');
    windowFrame.className = 'window-frame';
    const letterEl = document.createElement('div');
    letterEl.className = 'letter';
    letterEl.textContent = ALPHA[state.positions[idx]];
    windowFrame.appendChild(letterEl);
    rotorLetterEls[idx] = letterEl;

    const stepControls = document.createElement('div');
    stepControls.className = 'step-controls';
    const stepMinus = document.createElement('button');
    stepMinus.className = 'step-btn'; stepMinus.textContent = '−';
    const stepPlus = document.createElement('button');
    stepPlus.className = 'step-btn'; stepPlus.textContent = '+';
    stepMinus.addEventListener('click', ()=>{
      state.positions[idx] = (state.positions[idx]+25)%26;
      updateRotorDisplay();
    });
    stepPlus.addEventListener('click', ()=>{
      state.positions[idx] = (state.positions[idx]+1)%26;
      updateRotorDisplay();
    });
    stepControls.append(stepMinus, stepPlus);

    const capLabel = document.createElement('div');
    capLabel.style.fontSize = '9px';
    capLabel.style.color = 'var(--cream-dim)';
    capLabel.style.letterSpacing = '0.15em';
    capLabel.textContent = label.toUpperCase();

    unit.append(capLabel, select, ringRow, windowFrame, stepControls);
    rotorBay.appendChild(unit);
  });

  // Compact rotor-order selects inside the message panel (synced with main rotor bay)
  const msgRotorRow = document.getElementById('msgRotorRow');
  if(msgRotorRow){
    [0,1,2].forEach(idx=>{
      const sel = createRotorTypeSelect(idx, true);
      msgRotorRow.appendChild(sel);
    });
  }

  // ===== Reflector selector =====
  const REFLECTOR_HINTS = {
    B: 'Historically accurate: this reflector guarantees a letter can never encrypt to itself — the exact structural weakness Bletchley Park exploited with cribs.',
    P: 'The flaw is patched: this reflector allows a few letters to occasionally encrypt to themselves, so no crib can rely on "this letter never appears here."'
  };
  const reflectorSelect = document.getElementById('reflectorSelect');
  const reflectorHint = document.getElementById('reflectorHint');
  Object.keys(REFLECTORS).forEach(key=>{
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = REFLECTORS[key].label;
    if(key === state.reflector) opt.selected = true;
    reflectorSelect.appendChild(opt);
  });
  function updateReflectorHint(){
    reflectorHint.textContent = REFLECTOR_HINTS[state.reflector];
  }
  reflectorSelect.addEventListener('change', ()=>{
    state.reflector = reflectorSelect.value;
    updateReflectorHint();
  });
  updateReflectorHint();

  function updateRotorDisplay(animateIdx){
    state.positions.forEach((p, i)=>{
      rotorLetterEls[i].textContent = ALPHA[p];
    });
    if(animateIdx !== undefined){
      animateIdx.forEach(i=>{
        rotorLetterEls[i].classList.remove('spin');
        void rotorLetterEls[i].offsetWidth; // reflow to restart animation
        rotorLetterEls[i].classList.add('spin');
      });
    }
  }

  // ===== Build UI: Lampboard =====
  const lampEls = {};
  [document.getElementById('lampRow1'), document.getElementById('lampRow2'), document.getElementById('lampRow3')].forEach((rowEl, i)=>{
    LAMP_ROWS[i].forEach(ch=>{
      const lamp = document.createElement('div');
      lamp.className = 'lamp';
      lamp.textContent = ch;
      rowEl.appendChild(lamp);
      lampEls[ch] = lamp;
    });
  });

  function flashLamp(ch){
    const lamp = lampEls[ch];
    if(!lamp) return;
    lamp.classList.add('lit');
    setTimeout(()=>lamp.classList.remove('lit'), 180);
  }

  // ===== Build UI: Keyboard =====
  [document.getElementById('keyRow1'), document.getElementById('keyRow2'), document.getElementById('keyRow3')].forEach((rowEl, i)=>{
    KEY_ROWS[i].forEach(ch=>{
      const key = document.createElement('div');
      key.className = 'key';
      key.textContent = ch;
      key.addEventListener('click', ()=> pressLetter(ch, key));
      rowEl.appendChild(key);
    });
  });

  // ===== Build UI: Plugboard (supports multiple synced boards) =====
  const jackBoards = []; // each entry: { A: el, B: el, ... }
  let plugSelection = null;
  const plugHintEls = [];

  function buildPlugboardBoard(rowEls, hintEl){
    const jackEls = {};
    rowEls.forEach((rowEl, i)=>{
      PLUG_ROWS[i].forEach(ch=>{
        const jack = document.createElement('div');
        jack.className = 'jack';
        jack.textContent = ch;
        jack.addEventListener('click', ()=> handleJackClick(ch));
        rowEl.appendChild(jack);
        jackEls[ch] = jack;
      });
    });
    jackBoards.push(jackEls);
    if(hintEl) plugHintEls.push(hintEl);
  }

  buildPlugboardBoard(
    [document.getElementById('plugRow1'), document.getElementById('plugRow2'), document.getElementById('plugRow3')],
    document.getElementById('plugHint')
  );

  const msgPlugRow1 = document.getElementById('msgPlugRow1');
  if(msgPlugRow1){
    buildPlugboardBoard(
      [msgPlugRow1, document.getElementById('msgPlugRow2'), document.getElementById('msgPlugRow3')],
      document.getElementById('msgPlugHint')
    );
  }

  function handleJackClick(ch){
    // If already paired, unpair
    if(state.plugPairs[ch]){
      const other = state.plugPairs[ch];
      delete state.plugPairs[ch];
      delete state.plugPairs[other];
      refreshPlugUI();
      return;
    }
    if(plugSelection === ch){
      plugSelection = null;
      refreshPlugUI();
      return;
    }
    if(plugSelection === null){
      plugSelection = ch;
      refreshPlugUI();
      return;
    }
    // pair plugSelection <-> ch
    const pairCount = Object.keys(state.plugPairs).length / 2;
    if(pairCount >= 10){
      plugSelection = null;
      refreshPlugUI();
      return;
    }
    state.plugPairs[plugSelection] = ch;
    state.plugPairs[ch] = plugSelection;
    plugSelection = null;
    refreshPlugUI();
  }

  function refreshPlugUI(){
    jackBoards.forEach(jackEls=>{
      Object.values(jackEls).forEach(j=>{ j.classList.remove('selected','paired'); });
      Object.keys(state.plugPairs).forEach(ch=>{
        jackEls[ch].classList.add('paired');
      });
      if(plugSelection){
        jackEls[plugSelection].classList.add('selected');
      }
    });
    const pairCount = Object.keys(state.plugPairs).length / 2;
    const hintText = pairCount + " pair" + (pairCount===1?"":"s") + " connected";
    plugHintEls.forEach(el=>{ el.textContent = hintText; });
  }

  // ===== Enigma encryption logic =====
  function idx(ch){ return ch.charCodeAt(0) - 65; }
  function chr(i){ return ALPHA[((i%26)+26)%26]; }

  function encryptChar(inputCh){
    // step rotors first (right rotor always steps; double-step mechanism)
    stepRotors();

    let c = idx(inputCh);

    // Plugboard in
    if(state.plugPairs[inputCh]) c = idx(state.plugPairs[inputCh]);

    // Through rotors: right -> mid -> left
    for(let pos=2; pos>=0; pos--){
      c = rotorForward(c, pos);
    }

    // Reflector
    c = idx(REFLECTORS[state.reflector].wiring[c]);

    // Back through rotors: left -> mid -> right
    for(let pos=0; pos<=2; pos++){
      c = rotorBackward(c, pos);
    }

    let outCh = chr(c);

    // Plugboard out
    if(state.plugPairs[outCh]) outCh = state.plugPairs[outCh];

    return outCh;
  }

  function rotorForward(c, rotorIdx){
    const wiring = ROTORS[state.rotorTypes[rotorIdx]].wiring;
    const offset = state.positions[rotorIdx] - (state.ringSettings[rotorIdx]-1);
    const shifted = ((c + offset) % 26 + 26) % 26;
    const mapped = idx(wiring[shifted]);
    return ((mapped - offset) % 26 + 26) % 26;
  }
  function rotorBackward(c, rotorIdx){
    const wiring = ROTORS[state.rotorTypes[rotorIdx]].wiring;
    const offset = state.positions[rotorIdx] - (state.ringSettings[rotorIdx]-1);
    const shifted = ((c + offset) % 26 + 26) % 26;
    const mapped = wiring.indexOf(chr(shifted));
    return ((mapped - offset) % 26 + 26) % 26;
  }

  function stepRotors(){
    const rightNotch = idx(ROTORS[state.rotorTypes[2]].notch);
    const midNotch = idx(ROTORS[state.rotorTypes[1]].notch);
    const rightAtNotch = state.positions[2] === rightNotch;
    const midAtNotch = state.positions[1] === midNotch;

    const animate = [2];

    if(midAtNotch){
      state.positions[1] = (state.positions[1]+1)%26;
      state.positions[0] = (state.positions[0]+1)%26;
      animate.push(1,0);
    } else if(rightAtNotch){
      state.positions[1] = (state.positions[1]+1)%26;
      animate.push(1);
    }
    state.positions[2] = (state.positions[2]+1)%26;

    updateRotorDisplay(animate);
  }

  // ===== Input handling =====
  const inputEl = document.getElementById('inputText');
  const outputEl = document.getElementById('outputText');

  function pressLetter(ch, keyEl){
    if(keyEl){
      keyEl.classList.add('pressed');
      setTimeout(()=>keyEl.classList.remove('pressed'), 100);
    }
    const outCh = encryptChar(ch);
    flashLamp(outCh);
    outputEl.textContent += outCh;
    inputEl.value += ch;
  }

  inputEl.addEventListener('keydown', (e)=>{
    const ch = e.key.toUpperCase();
    if(ch.length === 1 && ALPHA.includes(ch)){
      e.preventDefault();
      // find on-screen key to animate, if present
      let keyEl = null;
      document.querySelectorAll('.key').forEach(k=>{ if(k.textContent === ch) keyEl = k; });
      pressLetter(ch, keyEl);
      inputEl.value = inputEl.value; // no-op, we append manually in pressLetter
    } else if(e.key === 'Backspace'){
      e.preventDefault(); // don't allow rewinding rotors via backspace — matches real machine behavior
    }
  });

  document.getElementById('resetBtn').addEventListener('click', ()=>{
    state.positions = [0,0,0];
    updateRotorDisplay();
  });
  document.getElementById('clearBtn').addEventListener('click', ()=>{
    inputEl.value = '';
    outputEl.textContent = '\u00A0';
  });
  document.getElementById('clearPlugsBtn').addEventListener('click', ()=>{
    state.plugPairs = {};
    plugSelection = null;
    refreshPlugUI();
  });

  // ===== Message Key selects =====
  const msgKeySelects = [
    document.getElementById('msgKeyLeft'),
    document.getElementById('msgKeyMid'),
    document.getElementById('msgKeyRight')
  ];
  msgKeySelects.forEach(sel=>{
    ALPHA.split('').forEach(l=>{
      const opt = document.createElement('option');
      opt.value = l; opt.textContent = l;
      sel.appendChild(opt);
    });
    sel.value = 'A';
  });

  function applyMessageKey(){
    state.positions = msgKeySelects.map(sel => idx(sel.value));
    updateRotorDisplay();
  }
  document.getElementById('msgKeyApply').addEventListener('click', applyMessageKey);

  // ===== Bulk message processing (used by both Encrypt and Decrypt — Enigma is symmetric) =====
  function processMessageText(text){
    applyMessageKey(); // always start from the declared message key, so encrypt/decrypt line up
    let result = '';
    for(const rawCh of text){
      const ch = rawCh.toUpperCase();
      if(ALPHA.includes(ch)){
        result += encryptChar(ch);
      } else {
        result += rawCh; // pass spaces, punctuation, line breaks through untouched, no rotor step
      }
    }
    return result;
  }

  // ===== Output mode: plain Enigma letters, or letters re-encoded as 5-bit binary =====
  let outputMode = 'letters'; // 'letters' | 'binary'

  function letterToBinary5(ch){
    return idx(ch).toString(2).padStart(5, '0');
  }
  function binaryTextToLetters(text){
    // Converts every contiguous run of 0/1 digits back into letters, 5 bits at a time.
    // Anything else (spaces, punctuation) passes through untouched.
    return text.replace(/[01]+/g, run=>{
      let out = '';
      for(let i=0; i+5 <= run.length; i+=5){
        out += ALPHA[parseInt(run.substr(i,5), 2)];
      }
      return out;
    });
  }
  function lettersTextToBinary(text){
    let out = '';
    for(const rawCh of text){
      const ch = rawCh.toUpperCase();
      out += ALPHA.includes(ch) ? letterToBinary5(ch) : rawCh;
    }
    return out;
  }

  const MODE_NOTES = {
    letters: 'A single encryption step: your message goes through the Enigma rotor cipher once. Encrypt and Decrypt run the exact same wiring (Enigma is self-reciprocal), so set the same <b>Message Key</b> above before either. Non-letter characters pass through unchanged.',
    binary: 'Two chained encryption steps: <b>Step 1</b> runs your message through the Enigma rotor cipher, exactly as in 1-Step mode. <b>Step 2</b> takes that result and re-encodes every letter as 5-bit binary (A=00000 … Z=11001). Decrypt reverses both steps in order: binary → letters first, then Enigma decryption. Spaces and punctuation pass through unchanged at every step.'
  };

  const modeLettersBtn = document.getElementById('modeLettersBtn');
  const modeBinaryBtn = document.getElementById('modeBinaryBtn');
  const modeNoteEl = document.getElementById('modeNote');
  const stepBreakdownEl = document.getElementById('stepBreakdown');

  function setOutputMode(mode){
    outputMode = mode;
    modeLettersBtn.classList.toggle('active', mode === 'letters');
    modeBinaryBtn.classList.toggle('active', mode === 'binary');
    modeNoteEl.innerHTML = MODE_NOTES[mode];
    if(mode === 'letters'){
      stepBreakdownEl.style.display = 'none';
      stepBreakdownEl.innerHTML = '';
    }
  }
  modeLettersBtn.addEventListener('click', ()=> setOutputMode('letters'));
  modeBinaryBtn.addEventListener('click', ()=> setOutputMode('binary'));
  setOutputMode('letters');

  function showSteps(steps){
    stepBreakdownEl.style.display = '';
    stepBreakdownEl.innerHTML = steps.map((s, i)=>{
      const line = '<div class="step-line"><span class="step-tag">Step '+(i+1)+' — '+s.label+'</span><span class="step-value">'+
        (s.value.length > 160 ? s.value.slice(0,160)+'…' : s.value) + '</span></div>';
      return i < steps.length-1 ? line + '<div class="step-arrow">▾</div>' : line;
    }).join('');
  }

  const msgInputEl = document.getElementById('msgInput');
  const msgOutputEl = document.getElementById('msgOutput');

  document.getElementById('encryptBtn').addEventListener('click', ()=>{
    const cipherLetters = processMessageText(msgInputEl.value);
    if(outputMode === 'binary'){
      const binaryResult = lettersTextToBinary(cipherLetters);
      msgOutputEl.value = binaryResult;
      showSteps([
        { label: 'Enigma cipher', value: cipherLetters || '(empty)' },
        { label: 'Binary encode', value: binaryResult || '(empty)' }
      ]);
    } else {
      msgOutputEl.value = cipherLetters;
    }
  });
  document.getElementById('decryptBtn').addEventListener('click', ()=>{
    if(outputMode === 'binary'){
      const lettersFromBinary = binaryTextToLetters(msgInputEl.value);
      const plaintext = processMessageText(lettersFromBinary);
      msgOutputEl.value = plaintext;
      showSteps([
        { label: 'Binary decode', value: lettersFromBinary || '(empty)' },
        { label: 'Enigma decrypt', value: plaintext || '(empty)' }
      ]);
    } else {
      msgOutputEl.value = processMessageText(msgInputEl.value);
    }
  });
  document.getElementById('swapBtn').addEventListener('click', ()=>{
    const tmp = msgInputEl.value;
    msgInputEl.value = msgOutputEl.value;
    msgOutputEl.value = tmp;
  });
  document.getElementById('copyBtn').addEventListener('click', (e)=>{
    if(!msgOutputEl.value) return;
    msgOutputEl.select();
    navigator.clipboard && navigator.clipboard.writeText(msgOutputEl.value).catch(()=>{});
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(()=>{ btn.textContent = original; }, 1200);
  });

  // decorative rivets
  const machine = document.getElementById('machine');
  [[10,10],[10,'auto'],[ 'auto',10]].forEach(()=>{});
  [[12,12],[null,12],[12,null],[null,null]].forEach((pos,i)=>{
    const r = document.createElement('div');
    r.className = 'rivet';
    if(i===0){ r.style.top='12px'; r.style.left='12px'; }
    if(i===1){ r.style.top='12px'; r.style.right='12px'; }
    if(i===2){ r.style.bottom='12px'; r.style.left='12px'; }
    if(i===3){ r.style.bottom='12px'; r.style.right='12px'; }
    machine.appendChild(r);
  });

  // ===== Send Result: Email (Gmail) or WhatsApp =====
  const recipientEmailEl = document.getElementById('recipientEmail');
  const emailSubjectEl = document.getElementById('emailSubject');
  const recipientPhoneEl = document.getElementById('recipientPhone');
  const includeSettingsEl = document.getElementById('includeSettings');
  const sendStatusEl = document.getElementById('sendStatus');
  const sendResultBtn = document.getElementById('sendResultBtn');
  const channelEmailBtn = document.getElementById('channelEmailBtn');
  const channelWaBtn = document.getElementById('channelWaBtn');
  const emailFieldsEl = document.getElementById('emailFields');
  const waFieldsEl = document.getElementById('waFields');

  let sendChannel = 'email';

  const STATUS_HINTS = {
    email: 'Opens a pre-filled Gmail compose window with the <b>Result</b> box above as the message body. You still click Send yourself — nothing is dispatched automatically from this page.',
    whatsapp: 'Opens WhatsApp (app or web) with a pre-filled chat to the number below. You still tap Send yourself — nothing is dispatched automatically from this page.'
  };

  function setChannel(channel){
    sendChannel = channel;
    channelEmailBtn.classList.toggle('active', channel === 'email');
    channelWaBtn.classList.toggle('active', channel === 'whatsapp');
    emailFieldsEl.style.display = channel === 'email' ? '' : 'none';
    waFieldsEl.style.display = channel === 'whatsapp' ? '' : 'none';
    sendResultBtn.textContent = channel === 'email' ? '✉ Send Result via Gmail' : '💬 Send Result via WhatsApp';
    sendStatusEl.innerHTML = STATUS_HINTS[channel];
  }
  channelEmailBtn.addEventListener('click', ()=> setChannel('email'));
  channelWaBtn.addEventListener('click', ()=> setChannel('whatsapp'));
  setChannel('email');

  function isValidEmail(str){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  }
  function digitsOnly(str){
    return str.replace(/[^\d]/g, '');
  }
  function isValidPhone(str){
    const d = digitsOnly(str);
    return d.length >= 8 && d.length <= 15;
  }

  function buildMessageBody(resultText){
    let body = resultText + '\n\n';
    if(includeSettingsEl.checked){
      body += '--- Cipher settings ---\n';
      body += 'Rotors (L, M, R): ' + state.rotorTypes.join(', ') + '\n';
      body += 'Ring settings (L, M, R): ' + state.ringSettings.join(', ') + '\n';
      body += 'Message key (L, M, R): ' + msgKeySelects.map(s=>s.value).join(', ') + '\n';
      const pairs = [];
      const seen = new Set();
      Object.keys(state.plugPairs).forEach(a=>{
        const b = state.plugPairs[a];
        const key = [a,b].sort().join('');
        if(!seen.has(key)){ seen.add(key); pairs.push(a+b); }
      });
      body += 'Plugboard pairs: ' + (pairs.length ? pairs.join(' ') : 'none') + '\n\n';
    }
    body += 'Sent from the Enigma simulator.';
    return body;
  }

  sendResultBtn.addEventListener('click', ()=>{
    const resultText = msgOutputEl.value.trim();
    if(!resultText){
      sendStatusEl.innerHTML = '<span style="color:var(--red)">Nothing to send yet — Encrypt or Decrypt a message first, or type into the Result box.</span>';
      return;
    }

    if(sendChannel === 'email'){
      const to = recipientEmailEl.value.trim();
      if(!isValidEmail(to)){
        recipientEmailEl.classList.add('invalid');
        sendStatusEl.innerHTML = '<span style="color:var(--red)">Enter a valid recipient email address first.</span>';
        recipientEmailEl.focus();
        return;
      }
      recipientEmailEl.classList.remove('invalid');

      const subject = emailSubjectEl.value.trim() || 'Enigma Encrypted Message';
      const body = buildMessageBody(resultText);

      const gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1'
        + '&to=' + encodeURIComponent(to)
        + '&su=' + encodeURIComponent(subject)
        + '&body=' + encodeURIComponent(body);

      window.open(gmailUrl, '_blank');
      sendStatusEl.innerHTML = 'Gmail compose window opened for <b>' + to + '</b> — review it and click <b>Send</b> over there.';

    } else {
      const rawPhone = recipientPhoneEl.value.trim();
      if(!isValidPhone(rawPhone)){
        recipientPhoneEl.classList.add('invalid');
        sendStatusEl.innerHTML = '<span style="color:var(--red)">Enter a valid phone number with country code first.</span>';
        recipientPhoneEl.focus();
        return;
      }
      recipientPhoneEl.classList.remove('invalid');

      const phone = digitsOnly(rawPhone);
      const body = buildMessageBody(resultText);

      const waUrl = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(body);

      window.open(waUrl, 'wa_web_tab');
      sendStatusEl.innerHTML = 'WhatsApp chat opened for <b>+' + phone + '</b> — review it and tap <b>Send</b> over there.';
    }
  });

  recipientEmailEl.addEventListener('input', ()=>{
    recipientEmailEl.classList.remove('invalid');
  });
  recipientPhoneEl.addEventListener('input', ()=>{
    recipientPhoneEl.classList.remove('invalid');
  });

  refreshPlugUI();
})();
