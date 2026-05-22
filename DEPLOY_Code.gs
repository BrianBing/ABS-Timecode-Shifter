/**
 * TimecodeUtils - Shared library for parsing, shifting, and formatting timecodes.
 * Works in both Node.js (for tests) and Google Apps Script (inlined).
 */
const TimecodeUtils = {
  // Regex to detect timecode strings: HH:MM:SS or MM:SS, optionally with frames or fractions
  // Examples: 01:23:45 | 23:45 | 01:23:45.678 | 01:23:45:12 | 01:23:45;20
  TIMECODE_REGEX: /\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:([.,:;])(\d{2,3}))?\b/g,

  /**
   * Check if parsed components represent a valid timecode.
   * Minutes and seconds must be less than 60.
   */
  isValidTimecode(minutes, seconds) {
    return minutes < 60 && seconds < 60;
  },

  /**
   * Parse text and find all valid timecodes with their indices and details.
   */
  findTimecodes(text) {
    const regex = new RegExp(this.TIMECODE_REGEX);
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      const minutes = parseInt(match[2], 10);
      const seconds = parseInt(match[3], 10);
      if (this.isValidTimecode(minutes, seconds)) {
        matches.push({
          matchText: match[0],
          index: match.index,
          length: match[0].length,
          hours: match[1] ? parseInt(match[1], 10) : null,
          minutes: minutes,
          seconds: seconds,
          separator: match[4] || null,
          fraction: match[5] ? parseInt(match[5], 10) : null,
          fractionDigits: match[5] ? match[5].length : 0
        });
      }
    }
    return matches;
  },

  /**
   * Convert a parsed timecode object to milliseconds.
   */
  toMilliseconds(tc, frameRate, subSecondMode, useDropFrame) {
    let hours = tc.hours !== null ? tc.hours : 0;
    
    // Check if we are using drop-frame mode (only relevant if subSecondMode is 'frames' and frame rate is 29.97 or 59.94)
    if (subSecondMode === 'frames' && useDropFrame && (frameRate === 29.97 || frameRate === 59.94)) {
      const frames = tc.fraction !== null ? tc.fraction : 0;
      let totalSeconds = hours * 3600 + tc.minutes * 60 + tc.seconds;
      let frameNumber = totalSeconds * Math.round(frameRate) + frames;
      let totalMinutes = hours * 60 + tc.minutes;
      let dropFrames = frameRate === 29.97 ? 2 : 4;
      let dropped = dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
      let actualFrameNumber = frameNumber - dropped;
      return actualFrameNumber * (1001 / Math.round(frameRate));
    }
    
    // Non-drop-frame or millisecond calculations
    let totalMs = (hours * 3600 + tc.minutes * 60 + tc.seconds) * 1000;
    if (tc.fraction !== null) {
      if (subSecondMode === 'frames') {
        const fps = frameRate || 24;
        const frameMs = 1000 / fps;
        totalMs += tc.fraction * frameMs;
      } else {
        // Milliseconds/centiseconds
        if (tc.fractionDigits === 3) {
          totalMs += tc.fraction;
        } else if (tc.fractionDigits === 2) {
          totalMs += tc.fraction * 10;
        } else if (tc.fractionDigits === 1) {
          totalMs += tc.fraction * 100;
        }
      }
    }
    return totalMs;
  },

  /**
   * Convert milliseconds to a timecode structure matching the original style.
   */
  fromMilliseconds(totalMs, originalStyle, frameRate, subSecondMode, useDropFrame) {
    // Clamp to 0 to prevent negative timecodes
    if (totalMs < 0) {
      totalMs = 0;
    }
    
    let hours = 0;
    let minutes = 0;
    let seconds = 0;
    let fraction = null;
    let fractionDigits = originalStyle.fractionDigits || 0;
    let separator = originalStyle.separator || '.';
    let hasHours = originalStyle.hours !== null;

    if (subSecondMode === 'frames' && useDropFrame && (frameRate === 29.97 || frameRate === 59.94)) {
      const dropFrames = frameRate === 29.97 ? 2 : 4;
      const roundedFps = Math.round(frameRate);
      const framesPer10Min = Math.round(17982 * (frameRate / 29.97));
      const framesPerMin = Math.round(1798 * (frameRate / 29.97));
      const firstMinFrames = roundedFps * 60; // 1800 for 30fps, 3600 for 60fps
      
      let frameNumber = Math.round(totalMs * (roundedFps / 1001));
      let m = frameNumber % framesPer10Min;
      
      let adjustment = 0;
      if (m >= firstMinFrames) {
        let minIndex = 1 + Math.floor((m - firstMinFrames) / framesPerMin);
        adjustment = minIndex * dropFrames;
      }
      
      let adjustedFrameNumber = frameNumber + adjustment;
      
      fraction = adjustedFrameNumber % roundedFps;
      let totalSeconds = Math.floor(adjustedFrameNumber / roundedFps);
      hours = Math.floor(totalSeconds / 3600);
      minutes = Math.floor((totalSeconds % 3600) / 60);
      seconds = totalSeconds % 60;
      
      // Force separator to semicolon if drop frame was originally used or if we want standard formatting
      if (separator === ':' || separator === ';') {
        separator = ';';
      }
    } else {
      if (subSecondMode === 'frames') {
        const fps = frameRate || 24;
        const frameDuration = 1000 / fps;
        let totalFrames = Math.round(totalMs / frameDuration);
        const intFps = Math.round(fps);
        
        fraction = totalFrames % intFps;
        let totalSeconds = Math.floor(totalFrames / intFps);
        hours = Math.floor(totalSeconds / 3600);
        minutes = Math.floor((totalSeconds % 3600) / 60);
        seconds = totalSeconds % 60;
      } else {
        // Milliseconds/centiseconds calculations
        let totalSeconds = Math.floor(totalMs / 1000);
        let ms = Math.round(totalMs % 1000);
        if (ms >= 1000) {
          ms -= 1000;
          totalSeconds += 1;
        }
        
        hours = Math.floor(totalSeconds / 3600);
        minutes = Math.floor((totalSeconds % 3600) / 60);
        seconds = totalSeconds % 60;
        
        if (fractionDigits > 0) {
          if (fractionDigits === 3) {
            fraction = ms;
          } else if (fractionDigits === 2) {
            fraction = Math.floor(ms / 10);
          } else if (fractionDigits === 1) {
            fraction = Math.floor(ms / 100);
          }
        }
      }
    }

    // If the shifted value exceeds 59 minutes, we must display hours even if the original didn't.
    if (hours > 0) {
      hasHours = true;
    }

    return {
      hours: hasHours ? hours : null,
      minutes,
      seconds,
      fraction,
      separator,
      fractionDigits
    };
  },

  /**
   * Format a timecode object to string.
   */
  format(tc) {
    const pad = (num, size = 2) => {
      let s = num.toString();
      while (s.length < size) s = "0" + s;
      return s;
    };

    let result = "";
    if (tc.hours !== null) {
      result += pad(tc.hours) + ":";
    }
    result += pad(tc.minutes) + ":" + pad(tc.seconds);
    if (tc.fraction !== null && tc.fractionDigits > 0) {
      result += tc.separator + pad(tc.fraction, tc.fractionDigits);
    }
    return result;
  },

  /**
   * Quick utility to shift a single timecode string.
   */
  shiftTimecodeString(tcStr, shiftAmountMs, frameRate, subSecondMode, useDropFrame) {
    const parsed = this.findTimecodes(tcStr)[0];
    if (!parsed) return tcStr;
    const ms = this.toMilliseconds(parsed, frameRate, subSecondMode, useDropFrame);
    const shiftedMs = ms + shiftAmountMs;
    const shiftedTc = this.fromMilliseconds(shiftedMs, parsed, frameRate, subSecondMode, useDropFrame);
    return this.format(shiftedTc);
  }
};

// Expose to Node.js context if running in Node.js (for offline tests)
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = TimecodeUtils;
}


/**
 * OnOpen event handler: creates custom menu.
 */
function onOpen(e) {
  DocumentApp.getUi()
    .createMenu('Timecode Shifter')
    .addItem('Open Shifter Sidebar', 'showSidebar')
    .addToUi();
}

/**
 * Opens the sidebar HTML.
 */
function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('ABS Timecode Shifter')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
  DocumentApp.getUi().showSidebar(html);
}

/**
 * Helper to recursively find all Text elements within an element in depth-first order.
 */
function getDescendantTextElements(element) {
  var textElements = [];
  if (element.getType() === DocumentApp.ElementType.TEXT) {
    textElements.push(element);
  } else if (element.getNumChildren) {
    for (var i = 0; i < element.getNumChildren(); i++) {
      textElements = textElements.concat(getDescendantTextElements(element.getChild(i)));
    }
  }
  return textElements;
}

/**
 * Helper to compare two element wrappers to check if they refer to the same underlying document element.
 */
function isSameElement(el1, el2) {
  if (!el1 || !el2) return false;
  var cur1 = el1;
  var cur2 = el2;
  while (cur1 && cur2) {
    if (cur1.getType() !== cur2.getType()) return false;
    var p1 = cur1.getParent();
    var p2 = cur2.getParent();
    if (!p1 && !p2) return true; // Reached root together
    if (!p1 || !p2) return false;
    if (p1.getChildIndex(cur1) !== p2.getChildIndex(cur2)) return false;
    cur1 = p1;
    cur2 = p2;
  }
  return !cur1 && !cur2;
}

/**
 * Core function to resolve document scopes into lists of Text elements with target character ranges.
 */
function getScopeElements(doc, scope) {
  var body = doc.getBody();
  if (!body) return [];

  var elementsToProcess = [];
  var timecodePreFilter = "[0-9]{1,2}:[0-9]{2}";

  if (scope === 'document') {
    var prevElement = null;
    var searchResult = body.findText(timecodePreFilter);
    while (searchResult !== null) {
      var textElem = searchResult.getElement().asText();
      if (!isSameElement(textElem, prevElement)) {
        prevElement = textElem;
        elementsToProcess.push({
          element: textElem,
          start: 0,
          end: textElem.getText().length - 1
        });
      }
      searchResult = body.findText(timecodePreFilter, searchResult);
    }
    return elementsToProcess;
  }

  // Handle selection and cursor scopes
  var selection = doc.getSelection();
  var cursor = doc.getCursor();

  if (scope === 'selection') {
    if (!selection) {
      throw new Error('No selection found. Please select the text containing timecodes.');
    }
    var rangeElements = selection.getRangeElements();
    for (var i = 0; i < rangeElements.length; i++) {
      var rangeElem = rangeElements[i];
      var element = rangeElem.getElement();
      
      if (element.getType() === DocumentApp.ElementType.TEXT) {
        var start = rangeElem.isPartial() ? rangeElem.getStartOffset() : 0;
        var end = rangeElem.isPartial() ? rangeElem.getEndOffsetInclusive() : element.getText().length - 1;
        elementsToProcess.push({
          element: element,
          start: start,
          end: end
        });
      } else {
        // If structural element, get its text children
        var textElems = getDescendantTextElements(element);
        for (var j = 0; j < textElems.length; j++) {
          elementsToProcess.push({
            element: textElems[j],
            start: 0,
            end: textElems[j].getText().length - 1
          });
        }
      }
    }
    return elementsToProcess;
  }

  if (scope === 'from-selection') {
    var startElement = null;
    var startOffset = 0;

    if (selection) {
      var rangeElem = selection.getRangeElements()[0];
      startElement = rangeElem.getElement();
      startOffset = rangeElem.isPartial() ? rangeElem.getStartOffset() : 0;
    } else if (cursor) {
      startElement = cursor.getElement();
      startOffset = cursor.getOffset();
    } else {
      throw new Error('No active cursor or selection found. Please place your cursor or select a start point.');
    }

    // 1. Manually check the startElement itself (if it is a Text element)
    if (startElement.getType() === DocumentApp.ElementType.TEXT) {
      var text = startElement.getText();
      var timecodes = TimecodeUtils.findTimecodes(text);
      var hasMatches = false;
      for (var i = 0; i < timecodes.length; i++) {
        if (timecodes[i].index >= startOffset) {
          hasMatches = true;
          break;
        }
      }
      if (hasMatches) {
        elementsToProcess.push({
          element: startElement,
          start: startOffset,
          end: text.length - 1
        });
      }
    }

    // 2. Create a range element for the startElement to begin findText search after it
    var rangeBuilder = doc.newRange();
    rangeBuilder.addElement(startElement);
    var startRangeElem = rangeBuilder.build().getRangeElements()[0];

    // 3. Find all matches occurring AFTER startElement in document order
    var prevElement = startElement; // Seed with startElement so we don't duplicate it if found
    var searchResult = body.findText(timecodePreFilter, startRangeElem);
    while (searchResult !== null) {
      var textElem = searchResult.getElement().asText();
      if (!isSameElement(textElem, prevElement)) {
        prevElement = textElem;
        elementsToProcess.push({
          element: textElem,
          start: 0,
          end: textElem.getText().length - 1
        });
      }
      searchResult = body.findText(timecodePreFilter, searchResult);
    }
    return elementsToProcess;
  }

  return [];
}

/**
 * Scans document scope to find the first timecode.
 * Called by frontend sidebar.js.
 */
function getFirstTimecode(scope) {
  var tStart = new Date().getTime();
  var timings = {};
  try {
    var doc = DocumentApp.getActiveDocument();
    var tDoc = new Date().getTime();
    timings.docInit = tDoc - tStart;
    
    var elements = getScopeElements(doc, scope);
    var tScope = new Date().getTime();
    timings.resolveScope = tScope - tDoc;
    timings.elementsChecked = elements.length;

    var matchText = null;
    var timeGetText = 0;
    
    for (var i = 0; i < elements.length; i++) {
      var item = elements[i];
      var tGetTextStart = new Date().getTime();
      var text = item.element.getText();
      timeGetText += (new Date().getTime() - tGetTextStart);
      
      var slice = text.substring(item.start, item.end + 1);
      var timecodes = TimecodeUtils.findTimecodes(slice);
      if (timecodes.length > 0) {
        matchText = timecodes[0].matchText;
        break;
      }
    }
    
    var tEnd = new Date().getTime();
    timings.total = tEnd - tStart;
    timings.getTextTotal = timeGetText;
    
    Logger.log("ABS Timecode Shifter Scan Timings: " + JSON.stringify(timings));
    
    return {
      matchText: matchText,
      timings: timings
    };
  } catch (err) {
    throw new Error(err.message);
  }
}

/**
 * Scans document scope and shifts all timecodes by specified ms.
 * Called by frontend sidebar.js.
 */
function shiftTimecodes(options) {
  var tStart = new Date().getTime();
  var timings = {};
  
  try {
    var doc = DocumentApp.getActiveDocument();
    var tDoc = new Date().getTime();
    timings.docInit = tDoc - tStart;
    
    var elements = getScopeElements(doc, options.scope);
    var tScope = new Date().getTime();
    timings.resolveScope = tScope - tDoc;
    timings.elementsChecked = elements.length;
    
    var count = 0;
    var clampedCount = 0;
    var modifiedElementsCount = 0;
    
    var timeGetText = 0;
    var timeReplacements = 0;
    
    var frameRate = options.frameRate;
    var subSecondMode = options.subSecondMode;
    var useDropFrame = options.useDropFrame;
    var shiftAmountMs = options.shiftAmountMs;

    for (var i = 0; i < elements.length; i++) {
      var item = elements[i];
      
      var tGetTextStart = new Date().getTime();
      var text = item.element.getText();
      timeGetText += (new Date().getTime() - tGetTextStart);
      
      // Find all matches in full element text
      var allMatches = TimecodeUtils.findTimecodes(text);
      var validMatches = [];
      
      // Filter matches that lie within the valid character range [item.start, item.end]
      for (var j = 0; j < allMatches.length; j++) {
        var match = allMatches[j];
        var matchEndIndex = match.index + match.length - 1;
        if (match.index >= item.start && matchEndIndex <= item.end) {
          validMatches.push(match);
        }
      }

      if (validMatches.length > 0) {
        modifiedElementsCount++;
        var tRepStart = new Date().getTime();
        
        // Process in REVERSE order to prevent index shifts during string modification
        for (var k = validMatches.length - 1; k >= 0; k--) {
          var match = validMatches[k];
          
          var originalMs = TimecodeUtils.toMilliseconds(match, frameRate, subSecondMode, useDropFrame);
          var shiftedMs = originalMs + shiftAmountMs;
          
          if (shiftedMs < 0) {
            shiftedMs = 0;
            clampedCount++;
          }
          
          var shiftedTc = TimecodeUtils.fromMilliseconds(shiftedMs, match, frameRate, subSecondMode, useDropFrame);
          var formatted = TimecodeUtils.format(shiftedTc);
          
          // Replace text in-place, preserving styling
          item.element.deleteText(match.index, match.index + match.length - 1);
          item.element.insertText(match.index, formatted);
          
          count++;
        }
        
        timeReplacements += (new Date().getTime() - tRepStart);
      }
    }

    var tEnd = new Date().getTime();
    timings.total = tEnd - tStart;
    timings.getTextTotal = timeGetText;
    timings.replacementsTotal = timeReplacements;
    timings.modifiedElements = modifiedElementsCount;

    Logger.log("ABS Timecode Shifter Timings: " + JSON.stringify(timings));

    return {
      count: count,
      clampedCount: clampedCount,
      timings: timings
    };
  } catch (err) {
    throw new Error(err.message);
  }
}
