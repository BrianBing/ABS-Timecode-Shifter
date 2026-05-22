// TIMECODE_UTILS_PLACEHOLDER

// Client-side Application State
const state = {
  scope: 'selection',       // 'selection', 'from-selection', 'document'
  mode: 'amount',           // 'amount', 'align'
  direction: 1,             // 1 = Forward (+), -1 = Backward (-)
  subSecondMode: 'frames',  // always 'frames'
  frameRate: 24,            // 23.976, 24, 25, 29.97, 30, 50, 59.94, 60
  useDropFrame: true,       // true, false
  detectedFirstTimecode: null // Parsed timecode object of first detected
};

// DOM Elements
const elements = {
  scopeControl: document.getElementById('scope-control'),
  scopeBtns: document.querySelectorAll('#scope-control .segment-btn'),
  
  tabs: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  tabAlignTrigger: document.getElementById('tab-align-trigger'),
  
  dirForward: document.getElementById('dir-forward'),
  dirBackward: document.getElementById('dir-backward'),
  
  inputH: document.getElementById('input-h'),
  inputM: document.getElementById('input-m'),
  inputS: document.getElementById('input-s'),
  inputSub: document.getElementById('input-sub'),
  subsecondSeparator: document.getElementById('subsecond-separator'),
  subsecondLabel: document.getElementById('subsecond-label'),
  
  detectedTimecode: document.getElementById('detected-timecode'),
  btnScan: document.getElementById('btn-scan'),
  inputTarget: document.getElementById('input-target'),
  
  btnToggleAdv: document.getElementById('btn-toggle-adv'),
  advContent: document.getElementById('adv-content'),
  collapsiblePanel: document.querySelector('.collapsible-panel'),
  
  groupFrameRate: document.getElementById('group-framerate'),
  selectFrameRate: document.getElementById('select-framerate'),
  groupDropFrame: document.getElementById('group-dropframe'),
  checkDropFrame: document.getElementById('check-dropframe'),
  
  btnRun: document.getElementById('btn-run'),
  btnText: document.querySelector('.btn-text'),
  btnLoader: document.querySelector('.btn-loader'),
  
  statusCard: document.getElementById('status-card'),
  statusIndicator: document.getElementById('status-indicator'),
  statusTitle: document.getElementById('status-title'),
  statusDesc: document.getElementById('status-desc')
};

// Initialize Application
function init() {
  setupEventListeners();
  updateSubSecondUI();
  scanForFirstTimecode();
}

// Set up UI Event Listeners
function setupEventListeners() {
  // 1. Scope Selection
  elements.scopeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.scopeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.scope = btn.dataset.value;
      
      // Auto-scan whenever scope changes
      scanForFirstTimecode();
    });
  });

  // 2. Mode Tabs
  elements.tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.tabs.forEach(b => b.classList.remove('active'));
      elements.tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const contentId = btn.dataset.tab;
      document.getElementById(contentId).classList.add('active');
      
      state.mode = (contentId === 'tab-amount') ? 'amount' : 'align';
      
      if (state.mode === 'align') {
        scanForFirstTimecode();
      }
    });
  });

  // 3. Direction Buttons
  elements.dirForward.addEventListener('click', () => {
    elements.dirForward.classList.add('active');
    elements.dirBackward.classList.remove('active');
    state.direction = 1;
  });
  elements.dirBackward.addEventListener('click', () => {
    elements.dirBackward.classList.add('active');
    elements.dirForward.classList.remove('active');
    state.direction = -1;
  });

  // 4. Advanced Settings Toggle
  elements.btnToggleAdv.addEventListener('click', () => {
    elements.collapsiblePanel.classList.toggle('open');
  });

  // 5. Frame Rate & Drop Frame Change
  elements.selectFrameRate.addEventListener('change', (e) => {
    state.frameRate = parseFloat(e.target.value);
    
    // Drop frame is only standard for 29.97 and 59.94
    if (state.frameRate === 29.97 || state.frameRate === 59.94) {
      elements.groupDropFrame.style.display = 'block';
    } else {
      elements.groupDropFrame.style.display = 'none';
      elements.checkDropFrame.checked = false;
      state.useDropFrame = false;
    }
  });

  elements.checkDropFrame.addEventListener('change', (e) => {
    state.useDropFrame = e.target.checked;
  });

  // 7. Auto-focus traversal and validation for time duration inputs
  const inputs = [elements.inputH, elements.inputM, elements.inputS, elements.inputSub];
  inputs.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      let val = e.target.value;
      // Allow only numbers
      val = val.replace(/\D/g, '');
      e.target.value = val;

      const maxLen = (input === elements.inputSub) ? (state.subSecondMode === 'frames' ? 2 : 3) : 2;
      
      // Auto advance focus to the next input if max digits typed
      if (val.length >= maxLen && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
        inputs[idx + 1].select();
      }
    });

    // On blur, pad with leading zeros and clamp to limits
    input.addEventListener('blur', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val)) val = 0;
      
      if (input === elements.inputM || input === elements.inputS) {
        if (val > 59) val = 59;
      } else if (input === elements.inputSub) {
        const limit = state.subSecondMode === 'frames' ? Math.round(state.frameRate) - 1 : 999;
        if (val > limit) val = limit;
      }
      
      const padLen = (input === elements.inputSub) ? (state.subSecondMode === 'frames' ? 2 : 3) : 2;
      e.target.value = String(val).padStart(padLen, '0');
    });

    // Select all text on focus for easier typing
    input.addEventListener('focus', () => {
      input.select();
    });
  });

  // 8. Refresh/Scan Button
  elements.btnScan.addEventListener('click', scanForFirstTimecode);

  // 9. Run Button
  elements.btnRun.addEventListener('click', runTimecodeShift);
}

// Update UI elements depending on current Frame Rate / drop frame selection
function updateSubSecondUI() {
  // Frames Mode is always active
  elements.subsecondSeparator.innerText = ':';
  elements.subsecondLabel.innerText = 'F';
  elements.inputSub.placeholder = '00';
  
  elements.groupFrameRate.style.display = 'block';
  state.frameRate = parseFloat(elements.selectFrameRate.value);
  
  if (state.frameRate === 29.97 || state.frameRate === 59.94) {
    elements.groupDropFrame.style.display = 'block';
    state.useDropFrame = elements.checkDropFrame.checked;
  } else {
    elements.groupDropFrame.style.display = 'none';
    elements.checkDropFrame.checked = false;
    state.useDropFrame = false;
  }
  
  const limit = Math.round(state.frameRate) - 1;
  if (parseInt(elements.inputSub.value, 10) > limit) {
    elements.inputSub.value = String(limit).padStart(2, '0');
  }
}

// Scans Document to detect first timecode in current scope
function scanForFirstTimecode() {
  updateStatus('running', 'Scanning...', 'Detecting timecode inside scope...');
  
  if (typeof google === 'undefined' || !google.script || !google.script.run) {
    // Offline simulation
    setTimeout(() => {
      const mockTimecode = '01:00:00:12';
      handleScanSuccess(mockTimecode);
    }, 600);
    return;
  }

  google.script.run
    .withSuccessHandler(handleScanSuccess)
    .withFailureHandler(handleScanFailure)
    .getFirstTimecode(state.scope);
}

function handleScanSuccess(response) {
  let timecodeStr = null;
  let timings = null;
  if (response) {
    if (typeof response === 'string') {
      timecodeStr = response;
    } else {
      timecodeStr = response.matchText;
      timings = response.timings;
    }
  }

  if (timecodeStr) {
    const parsed = TimecodeUtils.findTimecodes(timecodeStr)[0];
    if (parsed) {
      state.detectedFirstTimecode = parsed;
      elements.detectedTimecode.innerText = timecodeStr;
      elements.detectedTimecode.classList.remove('none');
      elements.inputTarget.disabled = false;
      elements.inputTarget.value = timecodeStr;
      
      let desc = `First timecode in scope: ${timecodeStr}`;
      if (timings) {
        console.log("ABS Timecode Shifter Scan Timings:", timings);
        desc += ` (scanned in ${timings.total}ms)`;
      }
      updateStatus('idle', 'Timecode Detected', desc);
      return;
    }
  }
  
  // No timecode found
  state.detectedFirstTimecode = null;
  elements.detectedTimecode.innerText = 'None detected';
  elements.detectedTimecode.classList.add('none');
  elements.inputTarget.disabled = true;
  elements.inputTarget.value = '';
  
  let desc = 'Place cursor near or select text containing a timecode.';
  if (response && response.noActiveSelection) {
    if (state.scope === 'selection') {
      desc = 'No text selected. Select a range containing timecodes.';
    } else {
      desc = 'No active cursor. Click inside the document to place your cursor.';
    }
  } else if (timings) {
    console.log("ABS Timecode Shifter Scan Timings:", timings);
    desc += ` (scan took ${timings.total}ms)`;
  }
  updateStatus('idle', 'No Timecode Found', desc);
}

function handleScanFailure(err) {
  state.detectedFirstTimecode = null;
  elements.detectedTimecode.innerText = 'Scan error';
  elements.detectedTimecode.classList.add('none');
  elements.inputTarget.disabled = true;
  elements.inputTarget.value = '';
  updateStatus('error', 'Scan Failed', err.message || 'Unable to scan document.');
}

// Shift duration conversion helper
function getShiftDurationMs() {
  const h = parseInt(elements.inputH.value, 10) || 0;
  const m = parseInt(elements.inputM.value, 10) || 0;
  const s = parseInt(elements.inputS.value, 10) || 0;
  const sub = parseInt(elements.inputSub.value, 10) || 0;
  
  let totalMs = (h * 3600 + m * 60 + s) * 1000;
  
  if (state.subSecondMode === 'frames') {
    const frameDurationMs = 1000 / state.frameRate;
    totalMs += sub * frameDurationMs;
  } else {
    // Milliseconds
    const padLen = elements.inputSub.value.length;
    if (padLen === 3) totalMs += sub;
    else if (padLen === 2) totalMs += sub * 10;
    else if (padLen === 1) totalMs += sub * 100;
  }
  
  return totalMs * state.direction;
}

// Triggers timecode shifting execution
function runTimecodeShift() {
  let shiftAmountMs = 0;
  let targetTimecodeStr = '';
  
  if (state.mode === 'amount') {
    shiftAmountMs = getShiftDurationMs();
    if (shiftAmountMs === 0) {
      updateStatus('error', 'Invalid Input', 'Shift amount must be greater than zero.');
      return;
    }
  } else {
    // Mode = Align
    if (!state.detectedFirstTimecode) {
      updateStatus('error', 'Align Error', 'No starting timecode detected to align.');
      return;
    }
    
    targetTimecodeStr = elements.inputTarget.value.trim();
    const targetParsed = TimecodeUtils.findTimecodes(targetTimecodeStr)[0];
    if (!targetParsed) {
      updateStatus('error', 'Invalid Format', 'Target timecode format is invalid.');
      return;
    }
    
    // Calculate shift amount as difference between target and original first timecode
    const originalMs = TimecodeUtils.toMilliseconds(
      state.detectedFirstTimecode, 
      state.frameRate, 
      state.subSecondMode, 
      state.useDropFrame
    );
    const targetMs = TimecodeUtils.toMilliseconds(
      targetParsed, 
      state.frameRate, 
      state.subSecondMode, 
      state.useDropFrame
    );
    
    shiftAmountMs = targetMs - originalMs;
    
    if (shiftAmountMs === 0) {
      updateStatus('idle', 'No Shift Needed', 'The target matches the current start timecode.');
      return;
    }
  }

  // Visual feedback: disable run button and show loading spinner
  elements.btnRun.disabled = true;
  elements.btnLoader.style.display = 'block';
  elements.btnText.innerText = 'Processing...';
  updateStatus('running', 'Shifting Timecodes', 'Modifying document...');

  const options = {
    scope: state.scope,
    mode: state.mode,
    shiftAmountMs: shiftAmountMs,
    targetTimecode: targetTimecodeStr,
    frameRate: state.frameRate,
    subSecondMode: state.subSecondMode,
    useDropFrame: state.useDropFrame
  };

  if (typeof google === 'undefined' || !google.script || !google.script.run) {
    // Offline simulation
    setTimeout(() => {
      elements.btnRun.disabled = false;
      elements.btnLoader.style.display = 'none';
      elements.btnText.innerText = 'Shift Timecodes';
      updateStatus('success', 'Completed (Simulation)', 'Found and shifted 12 timecode(s).');
      if (state.mode === 'align') {
        elements.detectedTimecode.innerText = targetTimecodeStr;
      }
    }, 1500);
    return;
  }

  google.script.run
    .withSuccessHandler((response) => {
      elements.btnRun.disabled = false;
      elements.btnLoader.style.display = 'none';
      elements.btnText.innerText = 'Shift Timecodes';
      
      const count = response.count || 0;
      const clampedCount = response.clampedCount || 0;
      let msg = `Successfully shifted ${count} timecode(s).`;
      if (clampedCount > 0) {
        msg += ` (${clampedCount} were clamped to 00:00:00).`;
      }
      
      if (response.timings) {
        console.log("ABS Timecode Shifter Debug Timings:", response.timings);
        msg += `\nTiming: ${response.timings.total}ms total (scope: ${response.timings.resolveScope}ms, read: ${response.timings.getTextTotal}ms, write: ${response.timings.replacementsTotal}ms on ${response.timings.modifiedElements}/${response.timings.elementsChecked} elements).`;
      }
      
      updateStatus('success', 'Execution Completed', msg);
      
      // If we aligned, update our scan cache
      if (state.mode === 'align' && count > 0) {
        scanForFirstTimecode();
      }
    })
    .withFailureHandler((err) => {
      elements.btnRun.disabled = false;
      elements.btnLoader.style.display = 'none';
      elements.btnText.innerText = 'Shift Timecodes';
      updateStatus('error', 'Execution Failed', err.message || 'An error occurred during shifting.');
    })
    .shiftTimecodes(options);
}

// Utility function to update the status card
function updateStatus(type, title, description) {
  // Remove existing indicator classes
  elements.statusIndicator.className = 'status-indicator ' + type;
  elements.statusTitle.innerText = title;
  elements.statusDesc.innerText = description;
  
  if (type === 'error') {
    elements.statusCard.style.borderColor = 'rgba(239, 68, 68, 0.4)';
  } else if (type === 'success') {
    elements.statusCard.style.borderColor = 'rgba(16, 185, 129, 0.4)';
  } else if (type === 'running') {
    elements.statusCard.style.borderColor = 'rgba(245, 158, 11, 0.4)';
  } else {
    elements.statusCard.style.borderColor = 'var(--border-glass)';
  }
}

// Launch application
document.addEventListener('DOMContentLoaded', init);
