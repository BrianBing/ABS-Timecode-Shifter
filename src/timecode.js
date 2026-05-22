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
