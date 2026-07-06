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

  // ===== State =====
  let state = {
    rotorTypes: ["I","II","III"],      // left, mid, right
    ringSettings: [1,1,1],             // 1-26
    positions: [0,0,0],                // 0-25 (A-Z) current window letter, left/mid/right
    plugPairs: {}                       // letter -> letter map (both directions)
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
  ["Left","Middle","Right"].forEach((label, idx) => {
    const unit = document.createElement('div');
    unit.className = 'rotor-unit';

    const select = document.createElement('select');
    select.className = 'rotor-select';
    Object.keys(ROTORS).forEach(r=>{
      const opt = document.createElement('option');
      opt.value = r; opt.textContent = "Rtr "+r;
      if(r === state.rotorTypes[idx]) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', ()=>{
      state.rotorTypes[idx] = select.value;
    });

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

  // ===== Build UI: Plugboard =====
  const jackEls = {};
  let plugSelection = null;
  [document.getElementById('plugRow1'), document.getElementById('plugRow2'), document.getElementById('plugRow3')].forEach((rowEl, i)=>{
    PLUG_ROWS[i].forEach(ch=>{
      const jack = document.createElement('div');
      jack.className = 'jack';
      jack.textContent = ch;
      jack.addEventListener('click', ()=> handleJackClick(ch));
      rowEl.appendChild(jack);
      jackEls[ch] = jack;
    });
  });

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
    Object.values(jackEls).forEach(j=>{ j.classList.remove('selected','paired'); });
    Object.keys(state.plugPairs).forEach(ch=>{
      jackEls[ch].classList.add('paired');
    });
    if(plugSelection){
      jackEls[plugSelection].classList.add('selected');
    }
    const pairCount = Object.keys(state.plugPairs).length / 2;
    document.getElementById('plugHint').textContent = pairCount + " pair" + (pairCount===1?"":"s") + " connected";
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
    c = idx(REFLECTOR_B[c]);

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

  const msgInputEl = document.getElementById('msgInput');
  const msgOutputEl = document.getElementById('msgOutput');

  document.getElementById('encryptBtn').addEventListener('click', ()=>{
    msgOutputEl.value = processMessageText(msgInputEl.value);
  });
  document.getElementById('decryptBtn').addEventListener('click', ()=>{
    msgOutputEl.value = processMessageText(msgInputEl.value);
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

  refreshPlugUI();
})();
