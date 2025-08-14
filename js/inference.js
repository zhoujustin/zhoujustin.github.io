"use strict"

import { Board, Location, C_EMPTY, C_BLACK, C_WHITE, P_BLACK, P_WHITE, NULL_LOC } from "./board.js";
import { NNPos } from "./nnpos.js";
import { NNInputs, inputTensor } from "./nninputs.js";

// logs a float array to the console, with one number per line
function logFloatArray(f) {
  const rowSize = 19;
  const colSize = 19;
  for (let i = 0; i < rowSize; i++) {
    let line = '';
    for (let j = 0; j < colSize; j++) {
      line += f[i * colSize + j].toFixed(2) + ' ';
    }
    console.log(line);
  }
  console.log(f[rowSize * colSize].toFixed(2));
}


async function runInference(board, nextPlayer, options = {}) {
  const { modelPath, tfLib, model: providedModel } = options;
  if (!tfLib) throw new Error("runInference requires a tfLib option");

  if (typeof tfLib.setBackend === 'function') {
    let ok = false;
    try { ok = await tfLib.setBackend('webgl'); } catch (e) { /* ignore */ }
    if (!ok || (typeof tfLib.getBackend === 'function' && tfLib.getBackend() !== 'webgl')) {
      await tfLib.setBackend('cpu');
    }
    if (typeof tfLib.getBackend === 'function') {
      console.log('tfjs backend:', tfLib.getBackend());
    }
  }

  const model = providedModel || (await tfLib.loadGraphModel(modelPath));
  const { bin_inputs, global_inputs } = inputTensor(board, nextPlayer);

  const batches = 1;
  const inputBufferLength = board.xSize * board.ySize;
  const inputBufferChannels = NNInputs.NUM_FEATURES_SPATIAL_V7;
  const inputGlobalBufferChannels = NNInputs.NUM_FEATURES_GLOBAL_V7;

  const results = await model.executeAsync({
    "swa_model/bin_inputs": tfLib.tensor(bin_inputs, [batches, inputBufferLength, inputBufferChannels], 'float32'),
    "swa_model/global_inputs": tfLib.tensor(global_inputs, [batches, inputGlobalBufferChannels], 'float32')
  });

  console.log(results);
  let flatPolicyArray = [];
  if (results[1] && typeof results[1].reshape === 'function') {
    const policyTensor = tfLib.reshape(tfLib.slice(results[1], [0, 0, 0], [1, 1, -1]), [-1]);
    
    console.log(`policyTensor: ${policyTensor}`);
    flatPolicyArray = (await policyTensor.array()) || [];
    console.log("flatPolicyArray: ", flatPolicyArray);
    logFloatArray(flatPolicyArray);
    const policyTensor2 = tfLib.reshape(tfLib.slice(results[1], [0, 1, 0], [1, 1, -1]), [-1]);
    console.log(`policyTensor2: ${policyTensor2}`);
    logFloatArray(await policyTensor2.array());
  }
  let flatScores = [];
  if (results[2] && typeof results[2].dataSync === 'function') {
    flatScores = Array.from(results[2].dataSync());
    console.log("flatScores: ", flatScores);
  }

  let copyPolicy = JSON.parse(JSON.stringify(flatPolicyArray));
  let topPolicies = copyPolicy.sort((a, b) => b - a).slice(0, 10);
  let topMoves = [];
  for (let move of topPolicies) {
    let index = flatPolicyArray.indexOf(move);
    console.log("loc", index%19, Math.floor(index/19));
    topMoves.push(index);
  }


  return { topMoves, flatScores };
}

export { runInference };
