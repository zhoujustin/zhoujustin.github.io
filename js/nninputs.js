"use strict";

// Neural network input utilities (V7 subset) translated to JavaScript
// Implements features: 0-5, 6 (koLoc only), 14, 17, 18, 19

import { Board, Location, C_EMPTY, C_BLACK, C_WHITE, P_BLACK, P_WHITE, NULL_LOC } from "./board.js";
import { NNPos } from "./nnpos.js";

class NNInputs {
  static NUM_FEATURES_SPATIAL_V7 = 22;
  static NUM_FEATURES_GLOBAL_V7 = 19;

  /**
   * Set a spatial feature value into rowBin given strides
   * rowBin layout supports both NCHW and NHWC via posStride and featureStride
   */
  static setRowBin(rowBin, pos, feature, value, posStride, featureStride) {
    rowBin[pos * posStride + feature * featureStride] = value;
  }

  /**
   * Fill a single row of NN inputs (V7). Only a subset of features is populated:
   * 0,1,2,3,4,5,6(ko only),14,17,18,19. All others remain zero.
   *
   * @param {Board} board
   * @param {number} nextPlayer - P_BLACK or P_WHITE
   * @param {number} nnXLen
   * @param {number} nnYLen
   * @param {boolean} useNHWC
   * @param {Float32Array|number[]} rowBin - size: NUM_FEATURES_SPATIAL_V7 * nnXLen * nnYLen
   * @param {Float32Array|number[]} rowGlobal - size: NUM_FEATURES_GLOBAL_V7
   */
  static fillRowV7(board, nextPlayer, nnXLen, nnYLen, useNHWC, rowBin, rowGlobal) {
    if (nnXLen <= 0 || nnYLen <= 0) throw new Error("fillRowV7: invalid nn dims");
    if (board.xSize > nnXLen || board.ySize > nnYLen)
      throw new Error("fillRowV7: board larger than NN dims");

    // Zero initialize outputs
    const spatialSize = NNInputs.NUM_FEATURES_SPATIAL_V7 * nnXLen * nnYLen;
    for (let i = 0; i < spatialSize; i++) rowBin[i] = 0.0;
    for (let i = 0; i < NNInputs.NUM_FEATURES_GLOBAL_V7; i++) rowGlobal[i] = 0.0;

    const pla = nextPlayer;
    const opp = pla === P_BLACK ? P_WHITE : P_BLACK;
    const xSize = board.xSize;
    const ySize = board.ySize;

    let featureStride, posStride;
    if (useNHWC) {
      featureStride = 1;
      posStride = NNInputs.NUM_FEATURES_SPATIAL_V7;
    } else {
      featureStride = nnXLen * nnYLen;
      posStride = 1;
    }

    // Global features per user spec
    // 0..4: treat past 5 moves as PASS_LOC
    for (let i = 0; i < 5; i++) rowGlobal[i] = 1.0;
    // 5: komi -> always 0.0
    rowGlobal[5] = 0.0;
    // 6,7: koRule == KO_SIMPLE -> encode as (true,false)
    rowGlobal[6] = 1.0;
    rowGlobal[7] = 0.0;
    // 8: 1.0
    rowGlobal[8] = 1.0;
    // 9: 1.0 for TERRITORY
    rowGlobal[9] = 1.0;
    // 10,11: None (0.0)
    rowGlobal[10] = 0.0;
    rowGlobal[11] = 0.0;
    // 12..18 already 0.0

    // Features 0-5 per board cell
    for (let y = 0; y < ySize; y++) {
      for (let x = 0; x < xSize; x++) {
        const pos = NNPos.xyToPos(x, y, nnXLen);
        const loc = Location.getLoc(x, y, xSize);

        // 0 - on board
        NNInputs.setRowBin(rowBin, pos, 0, 1.0, posStride, featureStride);

        const stone = board.colors[loc];

        // 1,2 - pla, opp stone
        if (stone === pla) NNInputs.setRowBin(rowBin, pos, 1, 1.0, posStride, featureStride);
        else if (stone === opp) NNInputs.setRowBin(rowBin, pos, 2, 1.0, posStride, featureStride);

        // 3,4,5 - 1,2,3 liberties for any stone
        if (stone === C_BLACK || stone === C_WHITE) {
          const libs = board.getNumLiberties(loc);
          if (libs === 1) NNInputs.setRowBin(rowBin, pos, 3, 1.0, posStride, featureStride);
          else if (libs === 2) NNInputs.setRowBin(rowBin, pos, 4, 1.0, posStride, featureStride);
          else if (libs === 3) NNInputs.setRowBin(rowBin, pos, 5, 1.0, posStride, featureStride);
        }
      }
    }

    // Feature 6 - ko-ban locations: ONLY current simple koLoc; ignore superko and encore variants
    if (board.koLoc !== NULL_LOC) {
      const pos = NNPos.locToPos(board.koLoc, xSize, nnXLen, nnYLen);
      if (pos >= 0 && pos < nnXLen * nnYLen) {
        NNInputs.setRowBin(rowBin, pos, 6, 1.0, posStride, featureStride);
      }
    }

    // Ladder features 14 and 17 using Board.iterLadders
    if (typeof board.iterLadders === "function") {
      board.iterLadders((loc, workingMoves) => {
        const pos = NNPos.locToPos(loc, xSize, nnXLen, nnYLen);
        if (pos >= 0 && pos < nnXLen * nnYLen) {
          // 14 - stones that are part of an inescapable atari or can be put into one (laddered)
          NNInputs.setRowBin(rowBin, pos, 14, 1.0, posStride, featureStride);

          // 17 - attacking working moves only when the laddered group is the opponent and has >1 liberty
          const color = board.colors[loc];
          if ((color === opp) && board.getNumLiberties(loc) > 1) {
            for (const mv of workingMoves) {
              const wpos = NNPos.locToPos(mv, xSize, nnXLen, nnYLen);
              if (wpos >= 0 && wpos < nnXLen * nnYLen) {
                NNInputs.setRowBin(rowBin, wpos, 17, 1.0, posStride, featureStride);
              }
            }
          }
        }
      });
    }

    // Features 18,19 - current territory/ownership from independent life analysis
    // Use options requested: keepTerritories=true, keepStones=true, isMultiStoneSuicideLegal=true
    if (typeof board.calculateIndependentLifeArea === "function") {
      const { result: area } = board.calculateIndependentLifeArea({
        keepTerritories: true,
        keepStones: true,
        isMultiStoneSuicideLegal: true,
      });
      for (let y = 0; y < ySize; y++) {
        for (let x = 0; x < xSize; x++) {
          const loc = Location.getLoc(x, y, xSize);
          const pos = NNPos.locToPos(loc, xSize, nnXLen, nnYLen);
          if (area[loc] === pla) {
            NNInputs.setRowBin(rowBin, pos, 18, 1.0, posStride, featureStride);
          } else if (area[loc] === opp) {
            NNInputs.setRowBin(rowBin, pos, 19, 1.0, posStride, featureStride);
          }
        }
      }
    }

    // All other spatial and global features remain at zero
  }
}

// Convenience exports for function-like usage
function setRowBin(rowBin, pos, feature, value, posStride, featureStride) {
  return NNInputs.setRowBin(rowBin, pos, feature, value, posStride, featureStride);
}

function fillRowV7(board, nextPlayer, nnXLen, nnYLen, useNHWC, rowBin, rowGlobal) {
  return NNInputs.fillRowV7(board, nextPlayer, nnXLen, nnYLen, useNHWC, rowBin, rowGlobal);
}

function inputTensor(board, nextPlayer, useNHWC = true) { /* Build NN inputs from Board via fillRowV7 */
  const nnX = board.xSize;
  const nnY = board.ySize;

  const bin_inputs = new Float32Array(NNInputs.NUM_FEATURES_SPATIAL_V7 * nnX * nnY);
  const global_inputs = new Float32Array(NNInputs.NUM_FEATURES_GLOBAL_V7);
  NNInputs.fillRowV7(board, nextPlayer, nnX, nnY, useNHWC, bin_inputs, global_inputs);
  return { bin_inputs, global_inputs };
}

// ESM exports for browser
export { NNInputs, setRowBin, fillRowV7, inputTensor };

// CommonJS export for Node compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NNInputs, setRowBin, fillRowV7, inputTensor };
}
