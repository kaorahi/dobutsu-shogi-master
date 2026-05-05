import {Board, Piece} from "./board";
import type {UI} from "./ui";
import {Move, Drop} from "./move";

export class CsaIO {
    constructor(private ui: UI) {}

    copyToClipboard(text = this.toText()) {
        this.copyText(text);
        wink();
    }

    loadFromClipboard(e: JQuery.TriggeredEvent) {
        const oe = e.originalEvent as ClipboardEvent;
        const text = oe.clipboardData?.getData("text") ?? "";
        this.loadFromText(text);
    }

    loadFromText(text: string) {
        if (!this.ui.enter()) return;
        $("#loading").show();
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                try {
                    this.ui.set_board(this.textToBoard(text));
                    this.ui.analysis_mode = true;
                    let prev_li: JQuery<HTMLElement> | null = null;
                    let is_white_turn = false;
                    text.split(/\r?\n/).forEach(line => {
                        const move = this.textToMove(line.trim(), is_white_turn);
                        if (!move) return;
                        this.ui.history.push([this.ui.ui_state, null, move]);
                        this.ui.ui_state = { board: move.new_board, depth: null };
                        prev_li = this.ui.add_to_record(move, prev_li);
                        is_white_turn = !is_white_turn;
                    });
                } catch {} finally {
                    $("#loading").hide();
                    this.ui.goto_history_len_leave(0);
                }
            });
        });
    }

    toText(): string {
        const b = this.ui.history[0]?.[0].board || this.ui.ui_state.board;
        const is_standard = b.hashstr() === Board.init().hashstr();
        const board_text = is_standard ? "" : this.boardToText(b, true);
        const hs = [...this.ui.history, ...this.ui.future.toReversed()];
        const moves = hs.flatMap(z => z.slice(1)).filter(m => m) as Move[];
        return board_text + moves.map(m => this.moveToText(m) + "\n").join("");
    }

    private boardToText(board: Board, is_black_turn: boolean): string {
        const seq = (n: number): number[] => Array.from({ length: n }, (_, k) => k);
        const piece_name = ["", "LI", "ZO", "KI", "HI", "NI"];
        const csa_piece_kind = (p: Piece): string => piece_name[Piece.kind(p)];
        const csa_piece_sign = (p: Piece): string =>
              p === Piece.Empty ? " " : Piece.mine_p(p) ? "+" : "-";
        const csa_piece = (p: Piece): string =>
              csa_piece_sign(p) + (csa_piece_kind(p) || "* ");
        const my_pieces = [Piece.Elephant, Piece.Giraffe, Piece.Chick];
        const opponent_pieces = my_pieces.map((p: Piece) => Piece.opponent[p]);
        const csa_row = (y: number) =>
              `P${y + 1}` + seq(3).map(x => csa_piece(board.get(2 - x, 3 - y))).join("") + "\n";
        const board_text = seq(4).map(csa_row).join("");
        const csa_hands = (ps: Piece[]) => {
            const body = ps.map(p => ("00" + csa_piece_kind(p)).repeat(board.hand(p))).join("");
            return (body === "") ? "" : "P" + csa_piece_sign(ps[0]) + body + "\n";
        };
        const hands_text = csa_hands(my_pieces) + csa_hands(opponent_pieces);
        const turn_text = (is_black_turn ? "+" : "-") + "\n";
        return board_text + hands_text + turn_text;
    }

    private textToBoard(text: string): Board {
        const piece_name = ["", "LI", "ZO", "KI", "HI", "NI"];
        const c2mypiece = (t: string) => piece_name.indexOf(t) as Piece;
        const opp = (p: Piece, sign: string) => (sign === "+") ? p : Piece.opponent[p];
        const c2p = (piece_str: string): Piece | null => {
            const m = piece_str.match(/^([-+])(..)$/);
            return m ? opp(c2mypiece(m[2]), m[1]) : null;
        };
        let board = Board.init();
        let white_turn_p = false;
        const parse_line = (s: string) => {
            if (s === "-")
                white_turn_p = true;
            const m_row = s.match(/^P([1-4])(...)(...)(...)$/);
            if (m_row) {
                const y = 4 - Number(m_row[1]);
                m_row.slice(2, 5).forEach((piece_str: string, idx: number) => {
                    const x = 2 - idx;
                    const p = c2p(piece_str);
                    board = board.del(x, y);
                    if (p !== null)
                        board = board.put(x, y, p);
                });
            }
            const m_hands = s.match(/^P([-+])((00..)+)$/);
            if (m_hands) {
                const sign = m_hands[1];
                let rest = m_hands[2];
                let m: RegExpMatchArray | null;
                while (m = rest.match(/^00(..)(.*)$/)) {
                    rest = m[2];
                    const myp = c2mypiece(m[1]);
                    board = (sign === "+") ? board.inc_hand(myp) :
                        board.revflip().inc_hand(myp).revflip();
                }
            }
        };
        text.split(/\r?\n/).forEach(line => parse_line(line));
        return white_turn_p ? board.revflip() : board;
    }

    private moveToText(m: Move): string {
        const piece_name = ["", "LI", "ZO", "KI", "HI", "NI"];
        const col_name = ["A", "B", "C"];
        const xy2s = (x: number, y: number): string => `${col_name[2 - x]}${4 - y}`;
        const np = m.new_board.get(m.nx, m.ny);
        const s = Piece.mine_p(np) ? "+" : "-";
        const from = (m instanceof Drop) ? "00" : xy2s(m.x, m.y);
        const to = xy2s(m.nx, m.ny);
        return s + from + to + piece_name[Piece.kind(np)];
    }

    private textToMove(s: string, is_white_turn: boolean): Move | null {
        try {
            const piece_name = ["", "LI", "ZO", "KI", "HI", "NI"];
            const col_name = ["A", "B", "C"];
            const s2xy = (sq: string): { x: number; y: number } | null => {
                const i = col_name.indexOf(sq[0]);
                const j = Number(sq[1]);
                if (i < 0 || Number.isNaN(j)) return null;
                return { x: 2 - i, y: 4 - j };
            };
            const sign = s[0];
            const from_str = s.slice(1, 3);
            const to_str = s.slice(3, 5);
            const piece_str = s.slice(5, 7);
            const from = from_str === "00" ? null : s2xy(from_str);
            const to = s2xy(to_str);
            if (!to) return null;
            const black_board = this.ui.revflip_maybe(this.ui.ui_state.board, is_white_turn);
            const moves = Move.possible_moves(black_board, false).map(m => this.ui.revflip_maybe(m, is_white_turn));
            if (from) {
                const query = {x: from.x, y: from.y, nx: to.x, ny: to.y};
                return moves.find(move => move.match_p(query)) || null;
            }
            const p = piece_name.indexOf(piece_str) as Piece;
            const piece = (sign === "+") ? p : Piece.opponent[p];
            const query = {p: piece, nx: to.x, ny: to.y};
            return moves.find(move => move.match_p(query)) || null;
        } catch {
            return null;
        }
    }

    private copyText(text: string) {
        const $textarea = $("<textarea>").val(text).css({ position: "fixed", left: "-9999px", top: "0" }).appendTo("body");
        const textarea = $textarea[0] as HTMLTextAreaElement;
        textarea.focus();
        textarea.select();
        try { document.execCommand("copy"); } catch {}
        $textarea.remove();
    }
}

let last_wink_animation: Animation | null = null;
function wink() {
    const keyframes = [{scale: 1}, {scale: 0.7}, {scale: 1}];
    last_wink_animation?.finish();
    last_wink_animation = $("#container")[0].animate(keyframes, 400);
}
