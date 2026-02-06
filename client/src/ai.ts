import {Board, Piece, Result, isResult} from "./board";

// Fake AI

export class AI {
    rules: string = 'val1n';
    // An oracle data base that maps a possible board to a move that AI should
    // choose to win.
    private db: Record<string, [number, number]> = {};
    // A larger dataset that maps each board to its depth.
    // It contains all reachable boards with depth > 3, enabling more flexible play.
    private keys: BigUint64Array;
    private vals: Uint8Array;

    // Decodes the pre-calculated data base
    constructor(rules: string, buf: string, keys: BigUint64Array, vals: Uint8Array) {
        this.rules = rules;
        this.keys = keys;
        this.vals = vals;
        buf.split(/\r?\n/).forEach(line => {
            const [board_hashstr, depth, move_idx] = line.split(/\s+/);
            this.db[board_hashstr] = [Number(depth), Number(move_idx)];
        });
    }

    lookup_depth(b: Board): number {
        const target = BigInt('0x' + b.hashstr());
        const i = binary_search(this.keys, target);
        return i >= 0 ? this.vals[i] : -1;
    }

    // Get the move index for a depth-4 (or more) boards
    lookup_db(b: Board): [number, number] {
        // lookup db
        const v = this.db[b.hashstr()];
        if (v) return v;
        // lookup key-value
        const depth = this.lookup_depth(b);
        const target_depth = depth > 0 ? depth - 1 : depth;
        const nbs = b.next_boards();
        const targets = nbs.filter(b2 =>
            this.lookup_depth(b2.reverse().normalize()) === target_depth);
        const nb = random_choice(targets);
        return [depth, nbs.indexOf(nb)];
    }

    // Make a board in that the opponent's lion is captured
    private calc_final_board(nr_nb: Board): Board | never {
        // Board#next_boards() returns Result::Win when a player can capture
        // the opponent's lion, instead of a board in that the lion is missing.
        // This function can be used to get such a board.
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 3; x++) {
                if (nr_nb.get(x, y) === Piece.opponent[Piece.Lion]) {
                    // delete the opponent's lion
                    nr_nb = nr_nb.del(x, y);
                    // search a board that any piece of mine can move to the
                    // cell where the opponent's lion was
                    let nr_nnbs = nr_nb.next_boards();
                    if (!isResult(nr_nnbs)) {
                        for (let nr_nnb of nr_nnbs) {
                            let p = nr_nnb.get(x, y);
                            if (p === Piece.Empty) continue;
                            if (nr_nb.hand(p) > nr_nnb.hand(p)) continue;
                            return nr_nnb;
                        }
                    }
                }
            }
        }
        throw new Error("unreachable");
    }

    // main search
    // Perform a shallow search to check low-depth boards omitted from
    // the database, while also referring to the database to handle
    // repetitions correctly (Sen-nichi-te).
    private search_core(nr_b: Board, limit: number): [number, Board] {
        const nr_nbs = nr_b.next_boards()
        // trivial cases
        if (nr_b.gameover_status() !== 0) return [0, nr_b];
        if (nr_nbs === Result.Win) return [1, this.calc_final_board(nr_b)];
        let [depth, idx] = this.lookup_db(nr_b);
        if (depth >= 0 && idx >= 0) return [depth, nr_nbs[idx]];
        if (limit < 1) return [-1, random_choice(nr_nbs)];
        // iteration
        const next_depth = b =>
              this.search_core(b.reverse().normalize(), limit - 1)?.[0];
        const ds = nr_nbs.map(next_depth);
        const ps = ds.filter(d => d >= 0);
        const pick = d => random_choice(nr_nbs.filter((b, k) => ds[k] === d))
        // prefer the shortest winning move...
        const winning_d = Math.min(...ps.filter(d => d % 2 === 0));
        if (winning_d < Infinity) return [winning_d + 1, pick(winning_d)];
        // ...or, uncertain moves
        if (ds.indexOf(-1) >= 0) return [-1, pick(-1)];
        // ...or, the longest losing move
        const losing_d = Math.max(...ps.filter(d => d % 2 !== 0));
        if (losing_d > -Infinity) return [losing_d + 1, pick(losing_d)];
        // no possible moves (for example, all pieces were captured)
        return [-1, nr_b];
    }

    // given a white board, returns a pair of depth and next black board
    search(b: Board): [number, Board] {
        let r_b = b.reverse(); // reverse black and white
        let nr_b = r_b.normalize(); // normalize 
        let flipped = r_b !== nr_b; // a flag if normalize caused a flip or not

        // find a next board
        let lowest_depth_in_database = 4;
        let [depth, nr_nb] = this.search_core(nr_b, lowest_depth_in_database);

        // invert the reverse and the normalization
        let r_nb = flipped ? nr_nb.flip() : nr_nb;
        let nb = r_nb.reverse();

        // we should go from b to nb
        return [depth, nb];
    }

    supports_best_move_only(): boolean {
        return this.vals.length === 0;
    }

    get_random_board(depth: number): Board {
        if (this.supports_best_move_only()) return Board.init();
        const len = this.keys.length;
        const max_trial = 99999
        for (let t = 0; t < max_trial; t++) {
            const i = Math.floor(Math.random() * len);
            if (this.vals[i] === depth) {
                const hashstr = this.keys[i].toString(16).padStart(15, "0");
                return Board.from_hashstr(hashstr);
            }
        }
        return Board.init();
    }
}

/////////////////////////////////////

function binary_search(arr, x) {
    let lo = 0;
    let hi = arr.length; // [lo, hi)
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        const v = arr[mid];
        if (v < x) lo = mid + 1;
        else hi = mid;
    }
    return (arr[lo] === x) ? lo : -1;
}

function random_choice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
