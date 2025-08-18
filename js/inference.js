"use strict"

import { Board, Location, C_EMPTY, C_BLACK, C_WHITE, P_BLACK, P_WHITE, NULL_LOC } from "./board.js";
import { NNPos } from "./nnpos.js";
import { NNInputs, inputTensor } from "./nninputs.js";

// Keep a single model instance per page and persist it in IndexedDB
let _modelPromise = null;

function deriveModelName(modelPath, fallback = "go-model") {
  try {
    // e.g. ./model/b10c128-s1141046784-d204142634/model.json -> b10c128-s1141046784-d204142634
    const m = modelPath.match(/model\/(.*?)\//);
    if (m && m[1]) return m[1];
  } catch (_) {}
  return fallback;
}

async function loadOrGetModel(tfLib, modelPath, modelName) {
  if (_modelPromise) return _modelPromise;
  const name = modelName || deriveModelName(modelPath);

  // 1) Try IndexedDB first (no network)
  try {
    _modelPromise = tfLib.loadGraphModel(`indexeddb://${name}`);
    const m = await _modelPromise;
    return m;
  } catch (_) {
    // ignore and fall through
  }

  // 2) Fallback to HTTP, then save to IndexedDB for next time
  _modelPromise = (async () => {
    const m = await tfLib.loadGraphModel(modelPath);
    try {
      await m.save(`indexeddb://${name}`);
    } catch (e) {
      console.warn("Failed to save model to IndexedDB, continuing without persistent cache:", e);
    }
    return m;
  })();
  return _modelPromise;
}

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
  if (f[rowSize * colSize]) {
    console.log(f[rowSize * colSize].toFixed(2));
  }
}


async function runInference(board, nextPlayer, options = {}) {
  const { modelPath, tfLib, model: providedModel, modelName } = options;
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

  const model = providedModel || (await loadOrGetModel(tfLib, modelPath, modelName));
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
  if (results[0] && typeof results[0].dataSync === 'function') {
    const flatPolicyArray = Array.from(results[0].dataSync());
    // console.log("flatPolicyArray: ", flatPolicyArray);
    console.log("owner: ");
    logFloatArray(flatPolicyArray);
  }

  let flatPolicyArray = [];
  let flatPolicyArray1 = [];
  let flatPolicyArray2 = [];
  if (results[1] && typeof results[1].reshape === 'function') {
    const policyTensor1 = tfLib.reshape(tfLib.slice(results[1], [0, 0, 0], [1, 1, -1]), [-1]);
    
    // console.log(`policyTensor1: ${policyTensor1}`);
    flatPolicyArray1 = (await policyTensor1.array()) || [];
    // console.log("flatPolicyArray1: ", flatPolicyArray1);
    console.log("probe: ");
    logFloatArray(flatPolicyArray1);
    
    // const policyTensor2 = tfLib.reshape(tfLib.slice(results[1], [0, 1, 0], [1, 1, -1]), [-1]);
    const policyTensor2 = tfLib.relu(
      tfLib.reshape(tfLib.slice(results[1], [0, 1, 0], [1, 1, -1]), [-1])
    );
    // console.log(`policyTensor2: ${policyTensor2}`);
    flatPolicyArray2 = (await policyTensor2.array()) || [];
    // console.log("flatPolicyArray2: ", flatPolicyArray2);
    console.log("aux probe: ")
    logFloatArray(flatPolicyArray2);
    
    const policyTensor = tfLib.add(policyTensor1, policyTensor2);
    flatPolicyArray = (await policyTensor.array()) || [];
    // console.log("flatPolicyArray: ", flatPolicyArray);
    console.log("policy: ");
    logFloatArray(flatPolicyArray);
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
    let val = flatPolicyArray[index];
    let val1 = flatPolicyArray1[index];
    let val2 = flatPolicyArray2[index];
    console.log("loc: (", index%19, Math.floor(index/19), ")", val, val1, val2);
    topMoves.push(index);
  }


  return { topMoves, flatScores };
}

export { runInference, loadOrGetModel };
