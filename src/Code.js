// TIMECODE_UTILS_PLACEHOLDER

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
