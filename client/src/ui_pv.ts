import {Board} from "./board";
import {Move, Normal} from "./move";

export interface UIAnalysisHost {
    ui_state: { board: Board, depth: number | null };
    swap_side_p: boolean;
    is_white_turn(): boolean;
    revflip_maybe(z: Board, flag: boolean): Board;
    revflip_maybe(z: Move, flag: boolean): Move;
    get_depth_and_best_moves(board?: Board, white_p?: boolean): [number, Move[]];
    query_move(piece: JQuery, query: any, cb: (move: Move) => void): void;
}

export function get_principal_variation(
    host: UIAnalysisHost,
    board = host.ui_state.board,
    white_p = host.is_white_turn(),
    max_plies = 12,
    first_move: Move | null = null,
): Move[] {
    const pv: Move[] = [];
    const seen = new Set<string>();
    let cur_board = board;
    let cur_white_p = white_p;
    const rest_plies = first_move ? Math.max(max_plies - 1, 0) : max_plies;
    if (first_move) {
        pv.push(first_move);
        cur_board = first_move.new_board;
        cur_white_p = !cur_white_p;
    }
    for (let ply = 0; ply < rest_plies; ply++) {
        const key = `${cur_white_p ? "w" : "b"}:${cur_board.hashstr()}`;
        if (seen.has(key)) break;
        seen.add(key);
        if (cur_board.gameover_status() !== 0) break;
        const [depth, moves] = host.get_depth_and_best_moves(cur_board, cur_white_p);
        if (depth === null || moves.length === 0) break;
        const move = moves[0];
        pv.push(move);
        cur_board = move.new_board;
        cur_white_p = !cur_white_p;
    }
    return pv;
}

export function format_principal_variation(
    host: UIAnalysisHost,
    board = host.ui_state.board,
    white_p = host.is_white_turn(),
    max_plies = 12,
    first_move: Move | null = null,
): string {
    const names: Record<string, string> = {
        "ライオン": "ラ",
        "ぞう": "ぞ",
        "きりん": "き",
        "ひよこ": "ひ",
        "にわとり": "に",
    };
    const abbreviate = (s: string): string =>
          s.replace(/ライオン|ぞう|きりん|ひよこ|にわとり/g, name => names[name]);
    let prev_text = "";
    return get_principal_variation(host, board, white_p, max_plies, first_move)
        .map(move => {
            const full_text = host.revflip_maybe(move, host.swap_side_p).toString();
            let text = full_text;
            if (prev_text.substring(1, 3) === full_text.substring(1, 3))
                text = full_text[0] + "同" + full_text.substr(3);
            prev_text = full_text;
            return abbreviate(text);
        })
        .join("");
}

export function get_hover_pv_move(host: UIAnalysisHost, piece: JQuery): Move | null {
    const legal_moves: Move[] = [];
    host.query_move(piece, {}, (move) => legal_moves.push(move));
    if (legal_moves.length === 0) return null;
    const [_, best_moves] = host.get_depth_and_best_moves();
    const best_keys = new Set(best_moves.map(move => move_key(move)));
    return legal_moves.find(move => best_keys.has(move_key(move))) || legal_moves[0];
}

function move_key(move: Move): string {
    return move instanceof Normal ?
          `N:${move.x},${move.y},${move.nx},${move.ny}` :
          `D:${move.p},${move.nx},${move.ny}`;
}
