"use strict";

// NNPos utilities translated from examples/nninputs.cpp
// Provides conversions between board coordinates/locations and neural-net policy indices.
// Depends on board.js for Location helpers and special locations.

import { Location, PASS_LOC, NULL_LOC } from "./board.js";

class NNPos {
  // Maximum board length supported by NN inputs (matches board.js default max)
  static MAX_BOARD_LEN = 19;

  // Maximum policy size for a single position = board area + 1 (pass)
  static MAX_NN_POLICY_SIZE = NNPos.MAX_BOARD_LEN * NNPos.MAX_BOARD_LEN + 1;

  /**
   * Convert (x,y) to NN policy position index.
   * @param {number} x - 0-based board x within nn grid
   * @param {number} y - 0-based board y within nn grid
   * @param {number} nnXLen - NN input width
   * @returns {number}
   */
  static xyToPos(x, y, nnXLen) {
    return y * nnXLen + x;
  }

  /**
   * Convert a Board loc to an NN policy position index.
   * Maps PASS_LOC -> nnXLen*nnYLen and NULL_LOC -> nnXLen*(nnYLen+1)
   * @param {number} loc - Board internal location index
   * @param {number} boardXSize - Logical board width
   * @param {number} nnXLen - NN input width
   * @param {number} nnYLen - NN input height
   * @returns {number}
   */
  static locToPos(loc, boardXSize, nnXLen, nnYLen) {
    if (loc === PASS_LOC) return nnXLen * nnYLen;
    if (loc === NULL_LOC) return nnXLen * (nnYLen + 1);
    return (
      Location.getY(loc, boardXSize) * nnXLen +
      Location.getX(loc, boardXSize)
    );
  }

  /**
   * Convert NN policy position index back to Board loc.
   * Interprets nnXLen*nnYLen as PASS_LOC, and out-of-board coords as NULL_LOC.
   * @param {number} pos - NN policy position index
   * @param {number} boardXSize - Logical board width
   * @param {number} boardYSize - Logical board height
   * @param {number} nnXLen - NN input width
   * @param {number} nnYLen - NN input height
   * @returns {number} Board loc
   */
  static posToLoc(pos, boardXSize, boardYSize, nnXLen, nnYLen) {
    if (pos === nnXLen * nnYLen) return PASS_LOC;
    const x = pos % nnXLen;
    const y = Math.floor(pos / nnXLen);
    if (x < 0 || x >= boardXSize || y < 0 || y >= boardYSize) return NULL_LOC;
    return Location.getLoc(x, y, boardXSize);
  }

  /**
   * Get the NN policy index corresponding to pass.
   */
  static getPassPos(nnXLen, nnYLen) {
    return nnXLen * nnYLen;
  }

  /**
   * Check if a policy index is the pass move.
   */
  static isPassPos(pos, nnXLen, nnYLen) {
    return pos === nnXLen * nnYLen;
  }

  /**
   * Get the policy size (board area plus pass).
   */
  static getPolicySize(nnXLen, nnYLen) {
    return nnXLen * nnYLen + 1;
  }
}

// ESM export for browser
export { NNPos };

// CommonJS export for Node compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NNPos };
}
