/**
 * JavaScript translation of the C++ Board class for Go game implementation
 * Originally from an unreleased project back in 2010, modified since.
 * Authors: brettharrison (original), David Wu (original and later modifications).
 * JavaScript translation: 2025
 */

// Constants
const MAX_LEN = 19;
const MAX_ARR_SIZE = (MAX_LEN + 2) * (MAX_LEN + 2);
const MAX_PLAY_SIZE = MAX_LEN * MAX_LEN;
const DEFAULT_LEN = 19;

// Color constants
const C_EMPTY = 0;
const C_BLACK = 1;
const C_WHITE = 2;
const C_WALL = 3;

// Player constants
const P_BLACK = 1;
const P_WHITE = 2;

// Special locations
const NULL_LOC = 0;
const PASS_LOC = -1;

/**
 * Location utility functions
 */
class Location {
  static getLineCnt() {
    return MAX_LEN + 2;
  }

  static getLoc(x, y, xSize) {
    //return (x + 1) + (y + 1) * (xSize + 1);
    return (x + 1) + (y + 1) * (xSize + 2);
  }

  static getX(loc, xSize) {
    //return (loc % (xSize + 1)) - 1;
    return (loc % (xSize + 2)) - 1;
  }

  static getY(loc, xSize) {
    //return Math.floor(loc / (xSize + 1)) - 1;
    return Math.floor(loc / (xSize + 2)) - 1;
  }

  static getAdjacentOffsets(xSize) {
    /*return [
      -(xSize + 1), // up
      -1,           // left
      1,            // right
      xSize + 1     // down
    ];*/
    return [
      -(xSize + 2), // up
      -1,           // left
      1,            // right
      xSize + 2     // down
    ];
  }

  static getDiagonalOffsets(xSize) {
    /*return [
      -(xSize + 1) - 1, // up-left
      -(xSize + 1) + 1, // up-right
      (xSize + 1) - 1,  // down-left
      (xSize + 1) + 1   // down-right
    ];*/
    return [
      -(xSize + 2) - 1, // up-left
      -(xSize + 2) + 1, // up-right
      (xSize + 2) - 1,  // down-left
      (xSize + 2) + 1   // down-right
    ];
  }

  static isAdjacent(loc0, loc1, xSize) {
    const diff = Math.abs(loc0 - loc1);
    //return diff === 1 || diff === (xSize + 1);
    return diff === 1 || diff === (xSize + 2);
  }

  static toString(loc, xSize, ySize) {
    if (loc === PASS_LOC) return 'pass';
    if (loc === NULL_LOC) return 'null';
    
    const x = this.getX(loc, xSize);
    const y = this.getY(loc, xSize);
    
    if (x < 0 || x >= xSize || y < 0 || y >= ySize) {
      return `(${x},${y})`;
    }
    
    const xChar = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
    if (x <= 24) {
      return `${xChar[x]}${ySize - y}`;
    } else {
      return `${xChar[Math.floor(x / 25) - 1]}${xChar[x % 25]}${ySize - y}`;
    }
  }
}

/**
 * Chain data structure for stone groups
 */
class ChainData {
  constructor() {
    this.owner = C_EMPTY;
    this.numLocs = 0;
    this.numLiberties = 0;
    this.libertyLoc = NULL_LOC;
  }
}

/**
 * Move record for undo functionality
 */
class MoveRecord {
  constructor() {
    this.loc = NULL_LOC;
    this.player = C_EMPTY;
    this.koLocBefore = NULL_LOC;
    this.posHashBefore = 0n; // Use BigInt for hash
    this.capturedChains = [];
  }
}

/**
 * Region analysis data structure for territory calculation
 */
class RegionAnalysisData {
  constructor() {
    this.regionIdxByLoc = new Int16Array(MAX_ARR_SIZE).fill(-1);
    this.nextEmptyOrOpp = new Int32Array(MAX_ARR_SIZE).fill(NULL_LOC);
    this.bordersNonPassAlivePlaByHead = new Uint8Array(MAX_ARR_SIZE).fill(0);
    this.vitalForPlaHeadsLists = []; // Grow dynamically
    this.vitalForPlaHeadsListsTotal = 0;
  }
}

/**
 * Main Board class - JavaScript translation of C++ Board
 */
class Board {
  constructor(xSize = DEFAULT_LEN, ySize = DEFAULT_LEN) {
    this.init(xSize, ySize);
  }

  // Copy constructor
  static copy(other) {
    const board = new Board(other.xSize, other.ySize);
    board.colors.set(other.colors);
    board.chainData = other.chainData.map(data => Object.assign(new ChainData(), data));
    board.chainHead.set(other.chainHead);
    board.nextInChain.set(other.nextInChain);
    board.koLoc = other.koLoc;
    board.posHash = other.posHash;
    board.numBlackCaptures = other.numBlackCaptures;
    board.numWhiteCaptures = other.numWhiteCaptures;
    board.adjOffsets = [...other.adjOffsets];
    return board;
  }

  init(xSize, ySize) {
    if (xSize < 0 || ySize < 0 || xSize > MAX_LEN || ySize > MAX_LEN) {
      throw new Error('Board.init - invalid board size');
    }

    this.xSize = xSize;
    this.ySize = ySize;

    // Initialize arrays
    this.colors = new Uint8Array(MAX_ARR_SIZE).fill(C_WALL);
    this.chainData = new Array(MAX_ARR_SIZE);
    this.chainHead = new Int32Array(MAX_ARR_SIZE);
    this.nextInChain = new Int32Array(MAX_ARR_SIZE);

    // Initialize chain data
    for (let i = 0; i < MAX_ARR_SIZE; i++) {
      this.chainData[i] = new ChainData();
    }

    // Set board positions to empty
    for (let y = 0; y < ySize; y++) {
      for (let x = 0; x < xSize; x++) {
        const loc = Location.getLoc(x, y, xSize);
        this.colors[loc] = C_EMPTY;
      }
    }

    this.koLoc = NULL_LOC;
    this.posHash = 0n; // Use BigInt for hash
    this.numBlackCaptures = 0;
    this.numWhiteCaptures = 0;

    this.adjOffsets = Location.getAdjacentOffsets(xSize);
  }

  // Utility methods
  getOpp(player) {
    return player === P_BLACK ? P_WHITE : P_BLACK;
  }

  isOnBoard(loc) {
    const x = Location.getX(loc, this.xSize);
    const y = Location.getY(loc, this.xSize);
    return x >= 0 && x < this.xSize && y >= 0 && y < this.ySize;
  }

  isEmpty() {
    for (let y = 0; y < this.ySize; y++) {
      for (let x = 0; x < this.xSize; x++) {
        const loc = Location.getLoc(x, y, this.xSize);
        if (this.colors[loc] !== C_EMPTY) {
          return false;
        }
      }
    }
    return true;
  }

  numStonesOnBoard() {
    let num = 0;
    for (let y = 0; y < this.ySize; y++) {
      for (let x = 0; x < this.xSize; x++) {
        const loc = Location.getLoc(x, y, this.xSize);
        if (this.colors[loc] === C_BLACK || this.colors[loc] === C_WHITE) {
          num++;
        }
      }
    }
    return num;
  }

  // Chain and liberty methods
  getChainSize(loc) {
    if (this.colors[loc] !== C_BLACK && this.colors[loc] !== C_WHITE) {
      throw new Error('getChainSize: location must be black or white');
    }
    return this.chainData[this.chainHead[loc]].numLocs;
  }

  getNumLiberties(loc) {
    if (this.colors[loc] !== C_BLACK && this.colors[loc] !== C_WHITE) {
      throw new Error('getNumLiberties: location must be black or white');
    }
    return this.chainData[this.chainHead[loc]].numLiberties;
  }

  getNumImmediateLiberties(loc) {
    let numLibs = 0;
    for (const offset of this.adjOffsets) {
      if (this.colors[loc + offset] === C_EMPTY) {
        numLibs++;
      }
    }
    return numLibs;
  }

  countLiberties(loc) {
    let numLibs = 0;
    for (const offset of this.adjOffsets) {
      if (this.colors[loc + offset] === C_EMPTY) {
        numLibs++;
      }
    }
    return numLibs;
  }

  // Move validation methods
  isSuicide(loc, player) {
    if (loc === PASS_LOC) return false;

    const opp = this.getOpp(player);
    
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      
      if (this.colors[adj] === C_EMPTY) {
        return false;
      } else if (this.colors[adj] === player) {
        if (this.getNumLiberties(adj) > 1) {
          return false;
        }
      } else if (this.colors[adj] === opp) {
        if (this.getNumLiberties(adj) === 1) {
          return false;
        }
      }
    }
    
    return true;
  }

  isIllegalSuicide(loc, player, isMultiStoneSuicideLegal) {
    const opp = this.getOpp(player);
    
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      
      if (this.colors[adj] === C_EMPTY) {
        return false;
      } else if (this.colors[adj] === player) {
        if (isMultiStoneSuicideLegal || this.getNumLiberties(adj) > 1) {
          return false;
        }
      } else if (this.colors[adj] === opp) {
        if (this.getNumLiberties(adj) === 1) {
          return false;
        }
      }
    }
    
    return true;
  }

  isKoBanned(loc) {
    return loc === this.koLoc;
  }

  isLegal(loc, player, isMultiStoneSuicideLegal = false) {
    if (loc === PASS_LOC) return true;
    if (!this.isOnBoard(loc)) return false;
    if (this.colors[loc] !== C_EMPTY) return false;
    if (this.isKoBanned(loc)) return false;
    if (this.isIllegalSuicide(loc, player, isMultiStoneSuicideLegal)) return false;
    return true;
  }

  isLegalIgnoringKo(loc, player, isMultiStoneSuicideLegal = false) {
    if (loc === PASS_LOC) return true;
    if (!this.isOnBoard(loc)) return false;
    if (this.colors[loc] !== C_EMPTY) return false;
    if (this.isIllegalSuicide(loc, player, isMultiStoneSuicideLegal)) return false;
    return true;
  }

  // Simple eye detection
  isSimpleEye(loc, player) {
    if (this.colors[loc] !== C_EMPTY) return false;

    let againstWall = false;
    
    // Check orthogonal neighbors
    for (let i = 0; i < 4; i++) {
      const adj = loc + this.adjOffsets[i];
      if (this.colors[adj] === C_WALL) {
        againstWall = true;
      } else if (this.colors[adj] !== player) {
        return false;
      }
    }

    // Check diagonal neighbors
    const opp = this.getOpp(player);
    let numOppCorners = 0;
    const diagOffsets = Location.getDiagonalOffsets(this.xSize);
    
    for (const offset of diagOffsets) {
      const corner = loc + offset;
      if (this.colors[corner] === opp) {
        numOppCorners++;
      }
    }

    return numOppCorners < 2 && !(againstWall && numOppCorners >= 1);
  }

  // Move execution
  playMove(loc, player, isMultiStoneSuicideLegal = false) {
    if (!this.isLegal(loc, player, isMultiStoneSuicideLegal)) {
      return false;
    }
    this.playMoveAssumeLegal(loc, player);
    return true;
  }

  playMoveAssumeLegal(loc, player) {
    // Pass move
    if (loc === PASS_LOC) {
      this.koLoc = NULL_LOC;
      return;
    }

    const opp = this.getOpp(player);

    // Place the stone
    this.colors[loc] = player;
    this.chainData[loc].owner = player;
    this.chainData[loc].numLocs = 1;
    this.chainData[loc].numLiberties = this.getNumImmediateLiberties(loc);
    this.chainHead[loc] = loc;
    this.nextInChain[loc] = loc;

    // Decrement liberties of adjacent friendly and opponent chains
    this.changeSurroundingLiberties(loc, opp, -1);

    let numCaptured = 0;
    let possibleKoLoc = NULL_LOC;

    // Merge with friendly chains
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      if (this.colors[adj] === player && this.chainHead[adj] !== this.chainHead[loc]) {
        this.mergeChains(loc, adj);
      }
    }

    // Handle captures
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      if (this.colors[adj] === opp && this.getNumLiberties(adj) === 0) {
        if (this.chainData[this.chainHead[adj]].numLocs === 1) {
          possibleKoLoc = adj;
        }
        numCaptured += this.removeChain(this.chainHead[adj]);
      }
    }

    // Update captures count
    if (player === P_BLACK) {
      this.numWhiteCaptures += numCaptured;
    } else {
      this.numBlackCaptures += numCaptured;
    }

    // Handle suicide
    if (this.getNumLiberties(loc) === 0) {
      const numSuicided = this.chainData[this.chainHead[loc]].numLocs;
      this.removeChain(this.chainHead[loc]);
      if (player === P_BLACK) {
        this.numBlackCaptures += numSuicided;
      } else {
        this.numWhiteCaptures += numSuicided;
      }
    }

    // Handle ko
    if (numCaptured === 1 && this.getChainSize(loc) === 1 && this.getNumLiberties(loc) === 1) {
      this.koLoc = possibleKoLoc;
    } else {
      this.koLoc = NULL_LOC;
    }
  }

  // Chain management
  mergeChains(loc1, loc2) {
    const head1 = this.chainHead[loc1];
    const head2 = this.chainHead[loc2];
    
    if (head1 === head2) return;

    // Make head1 the new head
    let cur = head2;
    do {
      this.chainHead[cur] = head1;
      cur = this.nextInChain[cur];
    } while (cur !== head2);

    // Merge the circular lists
    const temp = this.nextInChain[head1];
    this.nextInChain[head1] = this.nextInChain[head2];
    this.nextInChain[head2] = temp;

    // Update chain data
    this.chainData[head1].numLocs += this.chainData[head2].numLocs;
    this.recalculateChainLiberties(head1);
  }

  removeChain(chainHead) {
    const pla = this.chainData[chainHead].owner;
    const numStones = this.chainData[chainHead].numLocs;
    let cur = chainHead;
    do {
      this.colors[cur] = C_EMPTY;
      this.changeSurroundingLiberties(cur, pla, 1);
      cur = this.nextInChain[cur];
    } while (cur !== chainHead);

    return numStones;
  }

  changeSurroundingLiberties(loc, pla, delta) {
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      if (this.colors[adj] === C_WALL || this.colors[adj] === C_EMPTY || this.colors[adj] === pla) {
        continue;
      }

      const head = this.chainHead[adj];
      this.chainData[head].numLiberties += delta;
    }
  }

  recalculateChainLiberties(head) {
    const liberties = new Set();
    let cur = head;
    
    do {
      for (const offset of this.adjOffsets) {
        const adj = cur + offset;
        if (this.colors[adj] === C_EMPTY) {
          liberties.add(adj);
        }
      }
      cur = this.nextInChain[cur];
    } while (cur !== head);

    this.chainData[head].numLiberties = liberties.size;
  }

  changeSurroundingLiberties(loc, player, delta) {
    const visited = new Set();
    
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      if (this.colors[adj] === player) {
        const head = this.chainHead[adj];
        if (!visited.has(head)) {
          visited.add(head);
          this.chainData[head].numLiberties += delta;
        }
      }
    }
  }

  // Ladder detection helper functions
  
  /**
   * Helper function to find all liberties of a stone group.
   * Fills in buf array starting at bufIdx, avoiding duplicates from bufStart onwards.
   * Returns the number of liberties found.
   */
  findLiberties(loc, buf, bufStart, bufIdx) {
    let numFound = 0;
    let cur = loc;
    
    do {
      for (const offset of this.adjOffsets) {
        const lib = cur + offset;
        if (this.colors[lib] === C_EMPTY) {
          // Check for duplicates
          let foundDup = false;
          for (let j = bufStart; j < bufIdx + numFound; j++) {
            if (buf[j] === lib) {
              foundDup = true;
              break;
            }
          }
          
          if (!foundDup) {
            // Ensure buffer has enough space
            while (buf.length <= bufIdx + numFound) {
              buf.push(NULL_LOC);
            }
            buf[bufIdx + numFound] = lib;
            numFound++;
          }
        }
      }
      
      cur = this.nextInChain[cur];
    } while (cur !== loc);
    
    return numFound;
  }

  /**
   * Helper function to find captures that gain liberties for the group at loc.
   * Finds opponent groups in atari (1 liberty) that can be captured.
   * Fills in buf array starting at bufIdx, avoiding duplicates from bufStart onwards.
   * Returns the number of capture moves found.
   */
  findLibertyGainingCaptures(loc, buf, bufStart, bufIdx) {
    const opp = this.getOpp(this.colors[loc]);
    const chainHeadsChecked = new Set();
    let numFound = 0;
    
    let cur = loc;
    do {
      for (const offset of this.adjOffsets) {
        const adj = cur + offset;
        if (this.colors[adj] === opp) {
          const head = this.chainHead[adj];
          if (this.chainData[head].numLiberties === 1 && !chainHeadsChecked.has(head)) {
            // Capturing moves are precisely the liberties of the groups around us with 1 liberty
            numFound += this.findLiberties(adj, buf, bufStart, bufIdx + numFound);
            chainHeadsChecked.add(head);
          }
        }
      }
      
      cur = this.nextInChain[cur];
    } while (cur !== loc);
    
    return numFound;
  }

  /**
   * Returns fast lower and upper bounds on the number of liberties a new stone placed here would have.
   * Used for pruning in ladder search - much faster than actually calculating exact liberties.
   * Returns object with lowerBound and upperBound properties.
   */
  getBoundNumLibertiesAfterPlay(loc, player) {
    const opp = this.getOpp(player);
    
    let numImmediateLibs = 0;        // empty spaces adjacent
    let numCaps = 0;                 // number of adjacent directions in which we will capture
    let potentialLibsFromCaps = 0;   // Total number of stones we're capturing (possibly with multiplicity)
    let numConnectionLibs = 0;       // Sum over friendly groups connected to of their libs-1
    let maxConnectionLibs = 0;       // Max over friendly groups connected to of their libs-1
    
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      if (this.colors[adj] === C_EMPTY) {
        numImmediateLibs++;
      }
      else if (this.colors[adj] === opp) {
        const libs = this.chainData[this.chainHead[adj]].numLiberties;
        if (libs === 1) {
          numCaps++;
          potentialLibsFromCaps += this.chainData[this.chainHead[adj]].numLocs;
        }
      }
      else if (this.colors[adj] === player) {
        const libs = this.chainData[this.chainHead[adj]].numLiberties;
        const connLibs = libs - 1;
        numConnectionLibs += connLibs;
        if (connLibs > maxConnectionLibs) {
          maxConnectionLibs = connLibs;
        }
      }
    }
    
    const lowerBound = numCaps + (maxConnectionLibs > numImmediateLibs ? maxConnectionLibs : numImmediateLibs);
    const upperBound = numImmediateLibs + potentialLibsFromCaps + numConnectionLibs;
    
    return { lowerBound, upperBound };
  }

  /**
   * Heuristic function for move ordering in ladder search.
   * For each neighboring friendly group with >1 liberties, counts (liberties * 2 - 3).
   * Used to prioritize moves that connect to groups with more liberties.
   * Returns the heuristic value multiplied by 2.
   */
  countHeuristicConnectionLibertiesX2(loc, player) {
    let numLibsX2 = 0;
    
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      if (this.colors[adj] === player) {
        const libs = this.chainData[this.chainHead[adj]].numLiberties;
        if (libs > 1) {
          numLibsX2 += libs * 2 - 3;
        }
      }
    }
    
    return numLibsX2;
  }

  /**
   * Checks if playing at this location would result in a ko capture.
   * A ko capture occurs when:
   * 1. All adjacent points are either walls or opponent stones
   * 2. Exactly one adjacent opponent group is in atari (1 liberty)
   * 3. That capturable group has exactly one stone
   */
  wouldBeKoCapture(loc, player) {
    if (this.colors[loc] !== C_EMPTY) {
      return false;
    }

    const opp = this.getOpp(player);
    let oppCapturableLoc = NULL_LOC;

    // Check that surrounding points are all opponent-owned (or wall)
    // and that exactly one of them is a single-stone group with 1 liberty.
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;

      if (this.colors[adj] !== C_WALL && this.colors[adj] !== opp) {
        // Found a friendly stone or an empty point, so not a ko capture.
        return false;
      }

      if (this.colors[adj] === opp && this.getNumLiberties(adj) === 1) {
        if (oppCapturableLoc !== NULL_LOC) {
          // Found more than one capturable group.
          return false;
        }
        oppCapturableLoc = adj;
      }
    }

    if (oppCapturableLoc === NULL_LOC) {
      // No capturable group found.
      return false;
    }

    // Check that the capturable group has exactly one stone.
    if (this.chainData[this.chainHead[oppCapturableLoc]].numLocs !== 1) {
      return false;
    }

    return true; // All ko conditions met.
  }

  /**
   * Plays a move and records the changes for later undo.
   * Used in search algorithms that need to backtrack.
   * 
   * @param {number} loc - Location to play
   * @param {number} player - Player making the move
   * @returns {Object} Record of changes that can be undone
   */
  playMoveRecorded(loc, player) {
    const record = new MoveRecord();
    record.loc = loc;
    record.player = player;
    record.koLocBefore = this.koLoc;
    record.posHashBefore = this.posHash;
    record.capturedChains = [];

    // Before playing, find all adjacent opponent chains that are in atari
    // and will be captured by this move.
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      if (this.colors[adj] === this.getOpp(player)) {
        const head = this.chainHead[adj];
        // A chain is captured if it has 1 liberty AND that liberty is the current move's location
        if (this.chainData[head].numLiberties === 1 && this.chainData[head].libertyLoc === loc) {
          const chainLocs = [];
          let cur = head;
          do {
            chainLocs.push(cur);
            cur = this.nextInChain[cur];
          } while (cur !== head);

          // Avoid duplicates if multiple stones of the same chain are adjacent
          if (!record.capturedChains.some(c => c.head === head)) {
            record.capturedChains.push({
              head: head,
              locs: chainLocs,
              data: { ...this.chainData[head] }
            });
          }
        }
      }
    }

    this.playMoveAssumeLegal(loc, player);
    return record;
  }

  /**
   * Undoes a move that was recorded with playMoveRecorded.
   * 
   * @param {Object} record - Record from playMoveRecorded
   */
  undo(record) {
    const loc = record.loc;
    const player = record.player;
    const opp = this.getOpp(player);

    if (loc === PASS_LOC) {
      this.koLoc = record.koLocBefore;
      return;
    }

    // Step 1: Restore captured opponent chains first
    for (const capturedChain of record.capturedChains) {
      const head = capturedChain.head;
      
      // Restore each stone of the captured chain
      for (const chainLoc of capturedChain.locs) {
        this.colors[chainLoc] = opp;
        this.chainHead[chainLoc] = head;
      }
      
      // Restore the circular linked list for the chain
      for (let i = 0; i < capturedChain.locs.length; i++) {
        const cur = capturedChain.locs[i];
        const next = capturedChain.locs[(i + 1) % capturedChain.locs.length];
        this.nextInChain[cur] = next;
      }
      
      // Restore chain metadata
      this.chainData[head] = { ...capturedChain.data };
    }

    // Step 2: Remove the stone that was just played
    this.colors[loc] = C_EMPTY;
    this.chainHead[loc] = NULL_LOC;
    this.nextInChain[loc] = NULL_LOC;

    // Step 3: Recalculate liberties for all adjacent chains
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      if (this.colors[adj] !== C_EMPTY && this.colors[adj] !== C_WALL) {
        const head = this.chainHead[adj];
        this.chainData[head].numLiberties = this.getNumLiberties(adj);
      }
    }

    // Step 4: Restore global board state
    this.koLoc = record.koLocBefore;
    this.posHash = record.posHashBefore;
    
    // Update capture counts
    const totalCaptured = record.capturedChains.reduce((sum, chain) => sum + chain.locs.length, 0);
    if (player === C_BLACK) {
      this.numBlackCaptures -= totalCaptured;
    } else {
      this.numWhiteCaptures -= totalCaptured;
    }
  }

  recalculateLibertiesAfterStonePlacement(loc, player) {
    const opp = this.getOpp(player);
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      if (this.colors[adj] !== C_EMPTY && this.colors[adj] !== C_WALL) {
        this.chainData[this.chainHead[adj]].numLiberties = this.countLiberties(adj);
      }
    }
  }

  recalculateLibertiesAfterStoneRemoval(loc) {
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      if (this.colors[adj] !== C_EMPTY && this.colors[adj] !== C_WALL) {
        this.chainData[this.chainHead[adj]].numLiberties = this.countLiberties(adj);
      }
    }
  }

  /**
   * Sets a stone at the specified location, handling various cases.
   * This is a utility function for setting up board positions.
   * 
   * @param {number} loc - Location to set the stone
   * @param {number} color - Color to set (C_BLACK, C_WHITE, or C_EMPTY)
   * @returns {boolean} True if successful, false if invalid parameters
   */
  setStone(loc, color) {
    if (loc < 0 || loc >= MAX_ARR_SIZE || this.colors[loc] === C_WALL) {
      return false;
    }
    if (color !== C_BLACK && color !== C_WHITE && color !== C_EMPTY) {
      return false;
    }

    if (this.colors[loc] === color) {
      // Already the desired color, nothing to do
    } else if (this.colors[loc] === C_EMPTY) {
      // Placing a stone on empty space
      if (!this.isIllegalSuicide(loc, color, true)) {
        this.playMoveAssumeLegal(loc, color);
      }
    } else if (color === C_EMPTY) {
      // Removing a stone
      this.removeSingleStone(loc);
    } else {
      // Replacing a stone with a different color
      this.removeSingleStone(loc);
      if (!this.isSuicide(loc, color)) {
        this.playMoveAssumeLegal(loc, color);
      }
    }

    // Always clear ko location
    this.koLoc = NULL_LOC;
    return true;
  }

  /**
   * Removes a single stone, even if it's part of a larger group.
   * This is a helper method for setStone.
   * 
   * @param {number} loc - Location of the stone to remove
   */
  removeSingleStone(loc) {
    const player = this.colors[loc];
    if (player === C_EMPTY) {
      return; // Nothing to remove
    }

    // Save the entire chain's stone locations
    const chainLocs = [];
    let cur = loc;
    do {
      chainLocs.push(cur);
      cur = this.nextInChain[cur];
    } while (cur !== loc);

    // Delete the entire chain
    this.removeChain(loc);

    // Then add all the other stones back one by one
    for (const chainLoc of chainLocs) {
      if (chainLoc !== loc) {
        this.playMoveAssumeLegal(chainLoc, player);
      }
    }
  }

  // Main ladder search function - determines if a stone group can be captured through a ladder.
  searchIsLadderCaptured(loc, defenderFirst, buf) {
    const MAX_LADDER_SEARCH_NODE_BUDGET = 25000;
    const MAX_LADDER_SEARCH_DEPTH = 200;
    
    // Input validation
    if (loc < 0 || loc >= MAX_ARR_SIZE) {
      return false;
    }
    if (this.colors[loc] !== C_BLACK && this.colors[loc] !== C_WHITE) {
      return false;
    }
    
    const numLiberties = this.chainData[this.chainHead[loc]].numLiberties;
    if (numLiberties > 2 || (defenderFirst && numLiberties > 1)) {
      return false;
    }
    
    // Make it so that pla is always the defender
    const pla = this.colors[loc];
    const opp = this.getOpp(pla);
    
    // Clear the ko loc for the defender at the root node - assume all kos work for the defender
    const koLocSaved = this.koLoc;
    if (defenderFirst) {
      this.koLoc = NULL_LOC;
    }
    
    // Stack for the search
    const moveListStarts = new Array(MAX_LADDER_SEARCH_DEPTH);
    const moveListLens = new Array(MAX_LADDER_SEARCH_DEPTH);
    const moveListCur = new Array(MAX_LADDER_SEARCH_DEPTH);
    const records = new Array(MAX_LADDER_SEARCH_DEPTH);
    
    let stackDepth = 0;
    let nodesBudgetUsed = 0;
    let isDefenderToMove = defenderFirst;
    
    // Initialize root level
    moveListStarts[0] = 0;
    moveListLens[0] = 0;
    moveListCur[0] = 0;
    
    while (true) {
      nodesBudgetUsed++;
      if (nodesBudgetUsed >= MAX_LADDER_SEARCH_NODE_BUDGET) {
        break; // Budget exceeded, assume defender wins
      }
      
      // Check if we need to generate moves for this level
      if (moveListCur[stackDepth] === 0) {
        // Generate moves
        const bufStart = stackDepth > 0 ? moveListStarts[stackDepth-1] + moveListLens[stackDepth-1] : 0;
        let numMoves = 0;
        
        if (isDefenderToMove) {
          // Defender moves: liberty-gaining captures + liberties of the target group
          numMoves += this.findLibertyGainingCaptures(loc, buf, bufStart, 0);
          numMoves += this.findLiberties(loc, buf, bufStart, numMoves);
          
          // Sort defender moves by heuristic (moves that give more liberties first)
          const moves = buf.slice(bufStart, bufStart + numMoves);
          moves.sort((a, b) => {
            const boundsA = this.getBoundNumLibertiesAfterPlay(a, pla);
            const boundsB = this.getBoundNumLibertiesAfterPlay(b, pla);
            return boundsB.upperBound - boundsA.upperBound; // Higher upper bound first
          });
          
          // Copy sorted moves back
          for (let i = 0; i < numMoves; i++) {
            buf[bufStart + i] = moves[i];
          }
        } else {
          // Attacker moves: only on the liberties of the target group
          numMoves = this.findLiberties(loc, buf, bufStart, 0);
          
          // Sort attacker moves by heuristic (connection liberties)
          const moves = buf.slice(bufStart, bufStart + numMoves);
          moves.sort((a, b) => {
            const heuristicA = this.countHeuristicConnectionLibertiesX2(a, opp);
            const heuristicB = this.countHeuristicConnectionLibertiesX2(b, opp);
            return heuristicB - heuristicA; // Higher heuristic first
          });
          
          // Copy sorted moves back
          for (let i = 0; i < numMoves; i++) {
            buf[bufStart + i] = moves[i];
          }
        }
        
        moveListStarts[stackDepth] = bufStart;
        moveListLens[stackDepth] = numMoves;
      }
      
      // Check if we have more moves to try at this level
      if (moveListCur[stackDepth] >= moveListLens[stackDepth]) {
        // No more moves, backtrack
        if (stackDepth === 0) {
          break; // Search complete
        }
        
        // Undo the last move
        this.undo(records[stackDepth]);
        stackDepth--;
        isDefenderToMove = !isDefenderToMove;
        moveListCur[stackDepth]++;
        continue;
      }
      
      // Get the next move to try
      const moveIdx = moveListStarts[stackDepth] + moveListCur[stackDepth];
      const move = buf[moveIdx];
      
      // Check if this move is legal
      if (!this.isLegal(move, isDefenderToMove ? pla : opp)) {
        moveListCur[stackDepth]++;
        continue;
      }
      
      // For defender, check if this move gives too many liberties (early pruning)
      if (isDefenderToMove) {
        const bounds = this.getBoundNumLibertiesAfterPlay(move, pla);
        if (bounds.lowerBound >= 3) {
          // This move gives the group 3+ liberties, defender wins
          this.koLoc = koLocSaved;
          return false;
        }
      }
      
      // Make the move
      const record = this.playMoveRecorded(move, isDefenderToMove ? pla : opp);
      records[stackDepth + 1] = record;
      
      // Check if the target group still exists after the move
      if (this.colors[loc] === C_EMPTY) {
        // Target group was captured, attacker wins
        this.undo(record);
        this.koLoc = koLocSaved;
        return true;
      }
      
      // Check base cases after the move
      const newNumLiberties = this.chainData[this.chainHead[loc]].numLiberties;
      
      if (isDefenderToMove) {
        // After defender move
        if (newNumLiberties >= 3) {
          // Defender wins - group has 3+ liberties
          this.undo(record);
          this.koLoc = koLocSaved;
          return false;
        }
      } else {
        // After attacker move
        if (newNumLiberties <= 1) {
          // Attacker wins - group captured or in atari
          this.undo(record);
          this.koLoc = koLocSaved;
          return true;
        }
        if (newNumLiberties >= 3) {
          // If attacker move gives 3+ liberties, defender wins
          this.undo(record);
          this.koLoc = koLocSaved;
          return false;
        }
      }
      
      // Check for ko situations (favor defender)
      if (this.koLoc !== NULL_LOC) {
        this.undo(record);
        this.koLoc = koLocSaved;
        return false; // Ko favors defender
      }
      
      // Continue search
      stackDepth++;
      isDefenderToMove = !isDefenderToMove;
      moveListCur[stackDepth] = 0;
      
      if (stackDepth >= MAX_LADDER_SEARCH_DEPTH) {
        // Max depth reached, assume defender wins
        this.undo(record);
        this.koLoc = koLocSaved;
        return false;
      }
    }
    
    // Search completed without definitive result, assume defender wins
    this.koLoc = koLocSaved;
    return false;
  }

  // Territory calculation - main entry point
  calculateArea(options = {}) {
    const {
      nonPassAliveStones = false,
      safeBigTerritories = true,
      unsafeBigTerritories = true,
      isMultiStoneSuicideLegal = false
    } = options;

    const result = new Uint8Array(MAX_ARR_SIZE).fill(C_EMPTY);
    
    this.calculateAreaForPlayer(P_BLACK, safeBigTerritories, unsafeBigTerritories, 
                               isMultiStoneSuicideLegal, result);
    this.calculateAreaForPlayer(P_WHITE, safeBigTerritories, unsafeBigTerritories, 
                               isMultiStoneSuicideLegal, result);

    if (nonPassAliveStones) {
      for (let y = 0; y < this.ySize; y++) {
        for (let x = 0; x < this.xSize; x++) {
          const loc = Location.getLoc(x, y, this.xSize);
          if (result[loc] === C_EMPTY) {
            result[loc] = this.colors[loc];
          }
        }
      }
    }

    return result;
  }

  // Full implementation of Benson's algorithm for territory calculation
  calculateAreaForPlayer(player, safeBigTerritories, unsafeBigTerritories, 
                        isMultiStoneSuicideLegal, result) {
    const opponent = this.getOpp(player);
    
    // 1. Initialize data structures for region analysis
    const data = this.initializeRegionDataStructures();
    
    // 2. Discover all empty/opponent regions
    const regionInfo = this.discoverEmptyRegions(player, opponent, isMultiStoneSuicideLegal, data);
    
    // 3. Collect all player group heads
    const playerGroups = this.collectPlayerGroupHeads(player, regionInfo, data);
    
    // 4. Run Benson's algorithm to determine pass-alive groups
    this.runBensonsAlgorithm(playerGroups, data, regionInfo);
    
    // 5. Mark pass-alive stones in result
    this.markPassAliveStones(player, playerGroups, result);
    
    // 6. Mark territory ownership
    this.markTerritoryOwnership(player, safeBigTerritories, unsafeBigTerritories, 
                               playerGroups.atLeastOnePla, data, regionInfo, result);
  }

  // Helper 1: Initialize data structures for region analysis
  initializeRegionDataStructures() {
    const data = new RegionAnalysisData();
    
    // Initialize arrays with proper values
    data.regionIdxByLoc.fill(-1);
    data.nextEmptyOrOpp.fill(NULL_LOC);
    data.bordersNonPassAlivePlaByHead.fill(0);
    data.vitalForPlaHeadsListsTotal = 0;
    
    return data;
  }

  // Helper 2: Discover all empty/opponent regions using flood-fill
  discoverEmptyRegions(player, opponent, isMultiStoneSuicideLegal, data) {
    const maxRegions = Math.floor((MAX_LEN * MAX_LEN + 1) / 2) + 1;
    const regionInfo = {
      numRegions: 0,
      regionHeads: new Int32Array(maxRegions),
      vitalStart: new Uint16Array(maxRegions),
      vitalLen: new Uint16Array(maxRegions),
      numInternalSpacesMax2: new Uint8Array(maxRegions),
      containsOpp: new Uint8Array(maxRegions)
    };

    for (let y = 0; y < this.ySize; y++) {
      for (let x = 0; x < this.xSize; x++) {
        const loc = Location.getLoc(x, y, this.xSize);
        
        // Skip if already processed or not empty
        if (data.regionIdxByLoc[loc] !== -1 || this.colors[loc] !== C_EMPTY) {
          continue;
        }

        const regionIdx = regionInfo.numRegions++;
        
        // Initialize region metadata
        regionInfo.regionHeads[regionIdx] = loc;
        regionInfo.vitalStart[regionIdx] = data.vitalForPlaHeadsListsTotal;
        regionInfo.vitalLen[regionIdx] = 0;
        regionInfo.numInternalSpacesMax2[regionIdx] = 0;
        regionInfo.containsOpp[regionIdx] = 0;

        // Find adjacent player heads as initial vital candidates
        const initialVitalHeads = this.findAdjacentPlayerHeads(loc, player);
        
        // Store vital heads in the list
        for (const head of initialVitalHeads) {
          if (data.vitalForPlaHeadsListsTotal < data.vitalForPlaHeadsLists.length) {
            data.vitalForPlaHeadsLists[data.vitalForPlaHeadsListsTotal++] = head;
            regionInfo.vitalLen[regionIdx]++;
          }
        }

        // Build the connected region
        this.buildConnectedRegion(loc, regionIdx, player, opponent, 
                                 isMultiStoneSuicideLegal, data, regionInfo);
      }
    }

    return regionInfo;
  }

  // Helper 3: Find adjacent player group heads for a location
  findAdjacentPlayerHeads(loc, player) {
    const heads = new Set();
    
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      if (this.colors[adj] === player) {
        heads.add(this.chainHead[adj]);
      }
    }
    
    return Array.from(heads);
  }

  // Helper 4: Build connected region using breadth-first search
  buildConnectedRegion(initialLoc, regionIdx, player, opponent, 
                      isMultiStoneSuicideLegal, data, regionInfo) {
    const queue = [initialLoc];
    let queueHead = 0;
    
    data.regionIdxByLoc[initialLoc] = regionIdx;
    let tailTarget = initialLoc;

    while (queueHead < queue.length) {
      const loc = queue[queueHead++];
      
      // Filter vital heads - only keep those actually adjacent to this location
      if (regionInfo.vitalLen[regionIdx] > 0 && 
          (isMultiStoneSuicideLegal || this.colors[loc] === C_EMPTY)) {
        this.filterVitalHeads(loc, player, regionIdx, regionInfo, data);
      }

      // Check if this location is internal (not adjacent to player stones)
      if (regionInfo.numInternalSpacesMax2[regionIdx] < 2 && 
          !this.isAdjacentToPlayer(loc, player)) {
        regionInfo.numInternalSpacesMax2[regionIdx]++;
      }

      // Check if region contains opponent stones
      if (this.colors[loc] === opponent) {
        regionInfo.containsOpp[regionIdx] = 1;
      }

      // Link into circular list
      data.nextEmptyOrOpp[loc] = tailTarget;
      tailTarget = loc;

      // Add adjacent empty/opponent locations to queue
      for (const offset of this.adjOffsets) {
        const adj = loc + offset;
        if ((this.colors[adj] === C_EMPTY || this.colors[adj] === opponent) && 
            data.regionIdxByLoc[adj] === -1) {
          queue.push(adj);
          data.regionIdxByLoc[adj] = regionIdx;
        }
      }
    }

    // Close the circular linked list
    data.nextEmptyOrOpp[initialLoc] = tailTarget;
  }

  // Helper 5: Filter vital heads to only those adjacent to the current location
  filterVitalHeads(loc, player, regionIdx, regionInfo, data) {
    const vStart = regionInfo.vitalStart[regionIdx];
    const oldVLen = regionInfo.vitalLen[regionIdx];
    let newVLen = 0;

    for (let i = 0; i < oldVLen; i++) {
      const plaHead = data.vitalForPlaHeadsLists[vStart + i];
      if (this.isAdjacentToPlayerHead(loc, player, plaHead)) {
        data.vitalForPlaHeadsLists[vStart + newVLen] = plaHead;
        newVLen++;
      }
    }

    regionInfo.vitalLen[regionIdx] = newVLen;
  }

  // Helper 6: Check if location is adjacent to any stones of the given player
  isAdjacentToPlayer(loc, player) {
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      if (this.colors[adj] === player) {
        return true;
      }
    }
    return false;
  }

  // Helper 7: Check if location is adjacent to a specific player group head
  isAdjacentToPlayerHead(loc, player, plaHead) {
    for (const offset of this.adjOffsets) {
      const adj = loc + offset;
      if (this.colors[adj] === player && this.chainHead[adj] === plaHead) {
        return true;
      }
    }
    return false;
  }

  // Helper 8: Collect all player group heads and initialize vital counts
  collectPlayerGroupHeads(player, regionInfo, data) {
    const allPlaHeads = [];
    const vitalCountByPlaHead = new Uint16Array(MAX_ARR_SIZE).fill(0);
    
    // Find all group heads for this player
    for (let loc = 0; loc < MAX_ARR_SIZE; loc++) {
      if (this.colors[loc] === player && this.chainHead[loc] === loc) {
        allPlaHeads.push(loc);
      }
    }

    // Count vital liberties for each group head
    for (let i = 0; i < regionInfo.numRegions; i++) {
      const vStart = regionInfo.vitalStart[i];
      const vLen = regionInfo.vitalLen[i];
      
      for (let j = 0; j < vLen; j++) {
        const plaHead = data.vitalForPlaHeadsLists[vStart + j];
        vitalCountByPlaHead[plaHead]++;
      }
    }

    return {
      allPlaHeads,
      vitalCountByPlaHead,
      plaHasBeenKilled: new Uint8Array(allPlaHeads.length).fill(0),
      atLeastOnePla: allPlaHeads.length > 0
    };
  }

  // Helper 9: Run Benson's algorithm - iteratively remove groups without sufficient vital liberties
  runBensonsAlgorithm(playerGroups, data, regionInfo) {
    while (true) {
      let killedAnything = false;
      
      // Check each player group
      for (let i = 0; i < playerGroups.allPlaHeads.length; i++) {
        if (playerGroups.plaHasBeenKilled[i]) continue;
        
        const plaHead = playerGroups.allPlaHeads[i];
        
        // Groups need at least 2 vital liberties to be pass-alive
        if (playerGroups.vitalCountByPlaHead[plaHead] < 2) {
          playerGroups.plaHasBeenKilled[i] = 1;
          killedAnything = true;
          
          // Update regions that border this now-dead group
          this.updateBorderingRegions(plaHead, data, regionInfo, playerGroups);
        }
      }
      
      if (!killedAnything) break;
    }
  }

  // Helper 10: Update regions that border a newly killed group
  updateBorderingRegions(killedHead, data, regionInfo, playerGroups) {
    let cur = killedHead;
    
    do {
      // Check all adjacent locations
      for (const offset of this.adjOffsets) {
        const adj = cur + offset;
        const regionIdx = data.regionIdxByLoc[adj];
        
        if (regionIdx >= 0) {
          const regionHead = regionInfo.regionHeads[regionIdx];
          
          // Mark region as bordering non-pass-alive group
          if (!data.bordersNonPassAlivePlaByHead[regionHead]) {
            data.bordersNonPassAlivePlaByHead[regionHead] = 1;
            
            // Decrement vital counts for all groups this region was vital for
            const vStart = regionInfo.vitalStart[regionIdx];
            const vLen = regionInfo.vitalLen[regionIdx];
            
            for (let k = 0; k < vLen; k++) {
              const plaHead = data.vitalForPlaHeadsLists[vStart + k];
              if (playerGroups.vitalCountByPlaHead[plaHead] > 0) {
                playerGroups.vitalCountByPlaHead[plaHead]--;
              }
            }
          }
        }
      }
      
      cur = this.nextInChain[cur];
    } while (cur !== killedHead);
  }

  // Helper 11: Mark pass-alive stones in the result array
  markPassAliveStones(player, playerGroups, result) {
    for (let i = 0; i < playerGroups.allPlaHeads.length; i++) {
      if (!playerGroups.plaHasBeenKilled[i]) {
        const plaHead = playerGroups.allPlaHeads[i];
        let cur = plaHead;
        
        do {
          result[cur] = player;
          cur = this.nextInChain[cur];
        } while (cur !== plaHead);
      }
    }
  }

  // Helper 12: Mark territory ownership in the result array
  markTerritoryOwnership(player, safeBigTerritories, unsafeBigTerritories, 
                        atLeastOnePla, data, regionInfo, result) {
    for (let i = 0; i < regionInfo.numRegions; i++) {
      const head = regionInfo.regionHeads[i];
      const bordersNonPassAlive = data.bordersNonPassAlivePlaByHead[head];
      const containsOpp = regionInfo.containsOpp[i];
      const numInternal = regionInfo.numInternalSpacesMax2[i];
      
      // Mark pass-alive territory and safe big territories
      const shouldMarkUnconditionally = 
        (numInternal <= 1 && !bordersNonPassAlive && atLeastOnePla) ||
        (safeBigTerritories && !containsOpp && !bordersNonPassAlive && atLeastOnePla);
      
      if (shouldMarkUnconditionally) {
        let cur = head;
        do {
          result[cur] = player;
          cur = data.nextEmptyOrOpp[cur];
        } while (cur !== head);
      }
      // Mark unsafe big territories only if not already claimed
      else if (unsafeBigTerritories && !containsOpp && atLeastOnePla) {
        let cur = head;
        do {
          if (result[cur] === C_EMPTY) {
            result[cur] = player;
          }
          cur = data.nextEmptyOrOpp[cur];
        } while (cur !== head);
      }
    }
  }

  // Main entry point for calculating territory and pass-alive stones
  floodFillTerritory(startLoc, visited) {
    const territory = [];
    const queue = [startLoc];
    visited[startLoc] = 1;
    
    while (queue.length > 0) {
      const loc = queue.shift();
      territory.push(loc);
      
      for (const offset of this.adjOffsets) {
        const adj = loc + offset;
        if (this.colors[adj] === C_EMPTY && !visited[adj]) {
          visited[adj] = 1;
          queue.push(adj);
        }
      }
    }
    
    return territory;
  }

  determineTerritoryOwner(territory, player, opponent) {
    let playerBorder = false;
    let opponentBorder = false;
    
    for (const loc of territory) {
      for (const offset of this.adjOffsets) {
        const adj = loc + offset;
        if (this.colors[adj] === player) {
          playerBorder = true;
        } else if (this.colors[adj] === opponent) {
          opponentBorder = true;
        }
      }
    }
    
    if (playerBorder && !opponentBorder) {
      return player;
    } else if (opponentBorder && !playerBorder) {
      return opponent;
    }
    
    return C_EMPTY; // Neutral territory
  }

  // Board representation
  toString() {
    let result = '';
    
    for (let y = 0; y < this.ySize; y++) {
      for (let x = 0; x < this.xSize; x++) {
        const loc = Location.getLoc(x, y, this.xSize);
        const color = this.colors[loc];
        
        switch (color) {
          case C_EMPTY: result += '.'; break;
          case C_BLACK: result += 'X'; break;
          case C_WHITE: result += 'O'; break;
          default: result += '?'; break;
        }
        
        if (x < this.xSize - 1) result += ' ';
      }
      result += '\n';
    }
    
    return result;
  }

  // JSON serialization
  toJSON() {
    return {
      xSize: this.xSize,
      ySize: this.ySize,
      stones: this.toStringSimple('|'),
      koLoc: Location.toString(this.koLoc, this.xSize, this.ySize),
      numBlackCaptures: this.numBlackCaptures,
      numWhiteCaptures: this.numWhiteCaptures
    };
  }

  static fromJSON(data) {
    const board = new Board(data.xSize, data.ySize);
    // Parse stones string and set board state
    const lines = data.stones.split('|');
    
    for (let y = 0; y < data.ySize && y < lines.length; y++) {
      const line = lines[y];
      for (let x = 0; x < data.xSize && x < line.length; x++) {
        const loc = Location.getLoc(x, y, data.xSize);
        const char = line[x];
        
        switch (char) {
          case 'X':
          case 'x':
            board.colors[loc] = C_BLACK;
            break;
          case 'O':
          case 'o':
            board.colors[loc] = C_WHITE;
            break;
          default:
            board.colors[loc] = C_EMPTY;
            break;
        }
      }
    }
    
    board.numBlackCaptures = data.numBlackCaptures || 0;
    board.numWhiteCaptures = data.numWhiteCaptures || 0;
    
    // Rebuild chain structures
    board.rebuildAllChains();
    
    return board;
  }

  toStringSimple(lineDelimiter = '\n') {
    let result = '';
    
    for (let y = 0; y < this.ySize; y++) {
      for (let x = 0; x < this.xSize; x++) {
        const loc = Location.getLoc(x, y, this.xSize);
        const color = this.colors[loc];
        
        switch (color) {
          case C_EMPTY: result += '.'; break;
          case C_BLACK: result += 'X'; break;
          case C_WHITE: result += 'O'; break;
          default: result += '?'; break;
        }
      }
      result += lineDelimiter;
    }
    
    return result;
  }

  rebuildAllChains() {
    // Reset chain data
    for (let i = 0; i < MAX_ARR_SIZE; i++) {
      this.chainData[i] = new ChainData();
      this.chainHead[i] = NULL_LOC;
      this.nextInChain[i] = NULL_LOC;
    }

    const visited = new Uint8Array(MAX_ARR_SIZE).fill(0);
    
    for (let y = 0; y < this.ySize; y++) {
      for (let x = 0; x < this.xSize; x++) {
        const loc = Location.getLoc(x, y, this.xSize);
        if ((this.colors[loc] === C_BLACK || this.colors[loc] === C_WHITE) && !visited[loc]) {
          this.rebuildChain(loc, this.colors[loc], visited);
        }
      }
    }
  }

  rebuildChain(startLoc, player, visited) {
    const chain = [];
    const queue = [startLoc];
    visited[startLoc] = 1;
    
    // Find all stones in the chain
    while (queue.length > 0) {
      const loc = queue.shift();
      chain.push(loc);
      
      for (const offset of this.adjOffsets) {
        const adj = loc + offset;
        if (this.colors[adj] === player && !visited[adj]) {
          visited[adj] = 1;
          queue.push(adj);
        }
      }
    }

    // Set up chain data
    const head = startLoc;
    for (let i = 0; i < chain.length; i++) {
      const loc = chain[i];
      this.chainHead[loc] = head;
      this.nextInChain[loc] = chain[(i + 1) % chain.length];
    }

    this.chainData[head].owner = player;
    this.chainData[head].numLocs = chain.length;
    this.recalculateChainLiberties(head);
  }

  /**
   * Create a Board from a glift Goban object.
   * @param {Object} goban - glift.rules.Goban instance
   * @returns {Board} A new Board populated from the Goban
   */
  static fromGliftGoban(goban) {
    if (!goban || typeof goban.intersections !== 'function' || typeof goban.getAllPlacedStones !== 'function') {
      throw new Error('fromGliftGoban: invalid goban');
    }
    const size = goban.intersections();
    const board = new Board(size, size);

    // Helper to map glift color to internal color constants
    const mapColor = (gColor) => {
      // Prefer string compare to avoid requiring glift in module scope
      if (gColor === 'BLACK') return C_BLACK;
      if (gColor === 'WHITE') return C_WHITE;
      // If glift is available, compare against its enums safely
      try {
        if (typeof glift !== 'undefined' && glift.enums && glift.enums.states) {
          if (gColor === glift.enums.states.BLACK) return C_BLACK;
          if (gColor === glift.enums.states.WHITE) return C_WHITE;
        }
      } catch (_) { /* ignore */ }
      return C_EMPTY;
    };

    // Place stones
    const stones = goban.getAllPlacedStones();
    for (let i = 0; i < stones.length; i++) {
      const s = stones[i];
      if (!s || !s.point) continue;
      const x = typeof s.point.x === 'function' ? s.point.x() : s.point.x;
      const y = typeof s.point.y === 'function' ? s.point.y() : s.point.y;
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      const loc = Location.getLoc(x, y, size);
      const color = mapColor(s.color);
      if (color === C_BLACK || color === C_WHITE) {
        board.colors[loc] = color;
      }
    }

    // Ko location if present
    if (typeof goban.getKo === 'function') {
      const koPt = goban.getKo();
      if (koPt && (typeof koPt.x === 'function' || typeof koPt.x === 'number') && (typeof koPt.y === 'function' || typeof koPt.y === 'number')) {
        const kx = typeof koPt.x === 'function' ? koPt.x() : koPt.x;
        const ky = typeof koPt.y === 'function' ? koPt.y() : koPt.y;
        board.koLoc = Location.getLoc(kx, ky, size);
      } else {
        board.koLoc = NULL_LOC;
      }
    }

    // Reset captures and hash; rebuild chains
    board.numBlackCaptures = 0;
    board.numWhiteCaptures = 0;
    board.posHash = 0n;
    board.rebuildAllChains();

    return board;
  }

  /**
   * Replace this Board's state from a glift Goban object.
   * @param {Object} goban - glift.rules.Goban instance
   * @returns {Board} this
   */
  loadFromGliftGoban(goban) {
    if (!goban || typeof goban.intersections !== 'function' || typeof goban.getAllPlacedStones !== 'function') {
      throw new Error('loadFromGliftGoban: invalid goban');
    }
    const size = goban.intersections();
    this.init(size, size);

    const mapColor = (gColor) => {
      if (gColor === 'BLACK') return C_BLACK;
      if (gColor === 'WHITE') return C_WHITE;
      try {
        if (typeof glift !== 'undefined' && glift.enums && glift.enums.states) {
          if (gColor === glift.enums.states.BLACK) return C_BLACK;
          if (gColor === glift.enums.states.WHITE) return C_WHITE;
        }
      } catch (_) { /* ignore */ }
      return C_EMPTY;
    };

    const stones = goban.getAllPlacedStones();
    for (let i = 0; i < stones.length; i++) {
      const s = stones[i];
      if (!s || !s.point) continue;
      const x = typeof s.point.x === 'function' ? s.point.x() : s.point.x;
      const y = typeof s.point.y === 'function' ? s.point.y() : s.point.y;
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      const loc = Location.getLoc(x, y, size);
      const color = mapColor(s.color);
      if (color === C_BLACK || color === C_WHITE) {
        this.colors[loc] = color;
      }
    }

    if (typeof goban.getKo === 'function') {
      const koPt = goban.getKo();
      if (koPt && (typeof koPt.x === 'function' || typeof koPt.x === 'number') && (typeof koPt.y === 'function' || typeof koPt.y === 'number')) {
        const kx = typeof koPt.x === 'function' ? koPt.x() : koPt.x;
        const ky = typeof koPt.y === 'function' ? koPt.y() : koPt.y;
        this.koLoc = Location.getLoc(kx, ky, size);
      } else {
        this.koLoc = NULL_LOC;
      }
    }

    this.numBlackCaptures = 0;
    this.numWhiteCaptures = 0;
    this.posHash = 0n;
    this.rebuildAllChains();

    return this;
  }

  /**
   * Calculate Independent Life Area - determines regions that are definitively 
   * controlled by one player without being in seki (mutual life)
   */
  calculateIndependentLifeArea(options = {}) {
    const {
      keepTerritories = false,
      keepStones = false,
      isMultiStoneSuicideLegal = false
    } = options;
    
    // Initialize result array
    const result = new Array(MAX_ARR_SIZE).fill(C_EMPTY);
    let whiteMinusBlackIndependentLifeRegionCount = 0;
    
    // First, compute basic area using calculateArea
    const basicArea = new Array(MAX_ARR_SIZE).fill(C_EMPTY);
    
    // Calculate area for both players with safe and unsafe big territories
    this.calculateAreaForPlayer(P_BLACK, true, true, isMultiStoneSuicideLegal, basicArea);
    this.calculateAreaForPlayer(P_WHITE, true, true, isMultiStoneSuicideLegal, basicArea);
    
    // Fill empty spaces in basicArea with actual stone colors
    for (let y = 0; y < this.ySize; y++) {
      for (let x = 0; x < this.xSize; x++) {
        const loc = Location.getLoc(x, y, this.xSize);
        if (basicArea[loc] === C_EMPTY) {
          basicArea[loc] = this.colors[loc];
        }
      }
    }
    
    // Calculate independent life areas using helper function
    whiteMinusBlackIndependentLifeRegionCount = this.calculateIndependentLifeAreaHelper(
      basicArea, 
      result
    );
    
    // Optionally include territories
    if (keepTerritories) {
      for (let y = 0; y < this.ySize; y++) {
        for (let x = 0; x < this.xSize; x++) {
          const loc = Location.getLoc(x, y, this.xSize);
          if (basicArea[loc] !== C_EMPTY && basicArea[loc] !== this.colors[loc]) {
            result[loc] = basicArea[loc];
          }
        }
      }
    }
    
    // Optionally include stones
    if (keepStones) {
      for (let y = 0; y < this.ySize; y++) {
        for (let x = 0; x < this.xSize; x++) {
          const loc = Location.getLoc(x, y, this.xSize);
          if (basicArea[loc] !== C_EMPTY && basicArea[loc] === this.colors[loc]) {
            result[loc] = basicArea[loc];
          }
        }
      }
    }
    
    return {
      result,
      whiteMinusBlackIndependentLifeRegionCount
    };
  }

  /**
   * Helper function to calculate independent life areas by identifying seki regions
   */
  calculateIndependentLifeAreaHelper(basicArea, result) {
    const queue = [];
    let whiteMinusBlackIndependentLifeRegionCount = 0;
    
    // Array to track which locations are part of seki (mutual life)
    const isSeki = new Array(MAX_ARR_SIZE).fill(false);
    
    // First pass: identify seki regions
    this.identifySekiRegions(basicArea, isSeki, queue);
    
    // Second pass: mark independent life regions and count them
    whiteMinusBlackIndependentLifeRegionCount = this.markIndependentLifeRegions(
      basicArea, 
      result, 
      isSeki, 
      queue
    );
    
    return whiteMinusBlackIndependentLifeRegionCount;
  }

  /**
   * Identify regions that are seki (mutual life) by checking for:
   * 1. Stones in atari (1 liberty) within their own territory
   * 2. Regions touching dame (neutral) points
   */
  identifySekiRegions(basicArea, isSeki, queue) {
    const adjacentOffsets = Location.getAdjacentOffsets(this.xSize);
    
    for (let y = 0; y < this.ySize; y++) {
      for (let x = 0; x < this.xSize; x++) {
        const loc = Location.getLoc(x, y, this.xSize);
        
        if (basicArea[loc] !== C_EMPTY && !isSeki[loc]) {
          let isSekiRegion = false;
          
          // Check if stone of player owning the area is in atari
          if (this.colors[loc] === basicArea[loc] && this.getNumLiberties(loc) === 1) {
            isSekiRegion = true;
          }
          
          // Check if region touches dame (neutral empty points)
          if (!isSekiRegion) {
            for (const offset of adjacentOffsets) {
              const adj = loc + offset;
              if (this.colors[adj] === C_EMPTY && basicArea[adj] === C_EMPTY) {
                isSekiRegion = true;
                break;
              }
            }
          }
          
          // If this is a seki region, flood-fill to mark the entire connected area
          if (isSekiRegion) {
            this.floodFillSekiRegion(loc, basicArea[loc], basicArea, isSeki, queue);
          }
        }
      }
    }
  }

  /**
   * Flood-fill to mark an entire connected seki region
   */
  floodFillSekiRegion(startLoc, player, basicArea, isSeki, queue) {
    const adjacentOffsets = Location.getAdjacentOffsets(this.xSize);
    
    // Initialize queue and mark starting location
    queue.length = 0;
    isSeki[startLoc] = true;
    queue.push(startLoc);
    
    // BFS flood-fill
    while (queue.length > 0) {
      const currentLoc = queue.shift();
      
      // Check all adjacent locations
      for (const offset of adjacentOffsets) {
        const adj = currentLoc + offset;
        
        // If adjacent location belongs to same player and isn't marked as seki yet
        if (basicArea[adj] === player && !isSeki[adj]) {
          isSeki[adj] = true;
          queue.push(adj);
        }
      }
    }
  }

  /**
   * Mark independent life regions (non-seki areas) and count them
   */
  markIndependentLifeRegions(basicArea, result, isSeki, queue) {
    const adjacentOffsets = Location.getAdjacentOffsets(this.xSize);
    let whiteMinusBlackIndependentLifeRegionCount = 0;
    
    for (let y = 0; y < this.ySize; y++) {
      for (let x = 0; x < this.xSize; x++) {
        const loc = Location.getLoc(x, y, this.xSize);
        
        // If this location has a player assignment, isn't seki, and hasn't been processed yet
        if (basicArea[loc] !== C_EMPTY && !isSeki[loc] && result[loc] !== basicArea[loc]) {
          const player = basicArea[loc];
          
          // Count this as an independent region
          whiteMinusBlackIndependentLifeRegionCount += (player === P_WHITE ? 1 : -1);
          
          // Flood-fill to mark the entire independent region
          this.floodFillIndependentRegion(loc, player, basicArea, result, queue);
        }
      }
    }
    
    return whiteMinusBlackIndependentLifeRegionCount;
  }

  /**
   * Flood-fill to mark an entire connected independent life region
   */
  floodFillIndependentRegion(startLoc, player, basicArea, result, queue) {
    const adjacentOffsets = Location.getAdjacentOffsets(this.xSize);
    
    // Initialize queue and mark starting location
    queue.length = 0;
    result[startLoc] = basicArea[startLoc];
    queue.push(startLoc);
    
    // BFS flood-fill
    while (queue.length > 0) {
      const currentLoc = queue.shift();
      
      // Check all adjacent locations
      for (const offset of adjacentOffsets) {
        const adj = currentLoc + offset;
        
        // If adjacent location belongs to same player and hasn't been marked yet
        if (basicArea[adj] === player && result[adj] !== basicArea[adj]) {
          result[adj] = basicArea[adj];
          queue.push(adj);
        }
      }
    }
  }
}

// ESM exports for browser modules
export { Board, Location, C_EMPTY, C_BLACK, C_WHITE, P_BLACK, P_WHITE, NULL_LOC, PASS_LOC };

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Board,
    Location,
    C_EMPTY,
    C_BLACK,
    C_WHITE,
    P_BLACK,
    P_WHITE,
    NULL_LOC,
    PASS_LOC
  };
}