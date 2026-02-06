import "jquery-ui/dist/jquery-ui";
import "jquery-ui/themes/base/core.css";
import "jquery-ui/themes/base/button.css";
import "jquery-ui/themes/base/draggable.css";

// Hack to enable touch-punch for pointer device (e.g., Surface)
if ('onpointerenter' in window) {
  document["ontouchend"] = ((ev: TouchEvent) => void 0);
}

import "jquery-ui-touch-punch/jquery.ui.touch-punch";

import {Board, Piece, Result, isResult} from "./board";
import {AI} from "./ai";
import {Move, Normal, Drop} from "./move";

type UIState = { board: Board, depth: number };

export class UI {
    // the current board and its depth
    ui_state: UIState;

    // (the previous state, player's (black) move, master's (white) move)*
    history: [UIState, Move | null | false, Move | null | false][];

    // a mutex to change the state
    locked: boolean;

    analysis_mode = false;
    swap_side_p = false;
    puzzle_depth = 5;
    autorun_timer: number | null = null;
    autorun_running = false;

    is_white_turn(): boolean {
        const xor = (a: boolean, b: boolean): boolean => !!a !== !!b;
        return xor(this.swap_side_p, $("#record").children().length % 2 !== 0);
    }

    constructor(public ai: AI) {
        this.initialize_state();

        this.ui_state.board.update_rules(ai.rules);
        $("span#rules").text(ai.rules);
        $("li#rules-help").toggle(ai.rules !== "val1n");

        $("span.piece").draggable({
            start: (event, ui) => { this.dragstart($(event.target) as JQuery<HTMLElement>); },
            stop: (event, ui) => { this.dragstop(); },
            revert: "invalid",
            revertDuration: 300,
            zIndex: 1000,
            scroll: false
        });
        $("div.cell").droppable({
            drop: (event, ui) => { this.drop(ui.draggable, $(event.target) as JQuery<HTMLElement>); },
        });

        $("button").button();
        $("button#undo").click((e) => this.undo_turn());
        $("button#about").click((e) => {
            $("#about-dialog").click((e) => e.stopPropagation());
            $("#about-overlay").fadeIn("fast").off().click(() => {
                $("#about-overlay").fadeOut("fast");
            });
        });

        $("button#new-game").click((e) => this.restore_positions(false));
        $("button#swap").click((e) => this.restore_positions(true));
        $("button#analysis-mode").click((e) => {
            this.enter();
            this.analysis_mode = true;
            this.leave();
        });
        $("button#autorun").click((e) => this.start_autorun());
        // click anywhere to stop autorun
        document.addEventListener("click", (e) => this.stop_autorun(), {capture: true});
        $(document).on("keydown", (e) => this.stop_autorun());
        $("button#puzzle").click((e) =>
            this.set_random_board(this.puzzle_depth));
        $(".puzzle-button").each((_, b) => {
            const $b = $(b);
            const d = Number($b.attr("id")?.match(/puzzle([0-9]+)/)?.[1] ?? -1);
            $b.click((e) =>
                this.set_random_board(this.puzzle_depth = d));
        });
        if (this.ai.supports_best_move_only())
            $("button#swap, button#puzzle, .puzzle-button, button#analysis-mode, button#autorun").hide();
        this.dragstop();

        this.enter();
        this.set_board(this.inital_board());
        this.update_depth();
        this.leave();
    }

    initialize_state() {
        this.analysis_mode = false;
        this.swap_side_p = false;
        this.ui_state = { board: Board.init(), depth: -1 };
        this.history = [];
        $("ol#record").children().detach();
        $("#player-side-mark").text("▲");
        $("#master-side-mark").text("△");
    }

    restore_positions(swap_side: boolean) {
        if (!this.enter()) return;
        if (!window.confirm("はじめに戻す？")) return;
        const b = this.inital_board();
        this.set_board(this.revflip_maybe(this.inital_board(), swap_side));
        this.swap_side_p = swap_side;
        if (swap_side) {
            $("#player-side-mark").text("△");
            $("#master-side-mark").text("▲");
        }
        swap_side ? this.do_master_turn_leave() : this.leave();
    }

    inital_board(): Board {
        const s = new URLSearchParams(window.location.search).get("board");
        return s ? Board.from_hashstr(s) : Board.init();
    }

    set_board(board: Board) {
        const self = this;
        let rest = $("span.piece");
        const move_piece = (piece: Piece, place: JQuery) => {
            const kind = Piece.kind(piece);
            if (kind === Piece.Empty) return;
            const kind_class = [
                "", ".lion", ".elephant", ".giraffe",
                ".chick,.hen", ".chick,.hen",
            ][kind];
            const span = rest.filter(kind_class).first();
            rest = rest.not(span);
            self.animate_piece(span, span.parent(), place, true);
            const mine_p = Piece.mine_p(piece);
            span.toggleClass("master", !mine_p);
            span.toggleClass("player", mine_p);
            span.toggleClass("promoted", kind === Piece.Hen);
        }
        // cells
        for (const x of [0, 1, 2])
            for (const y of [0, 1, 2, 3])
                move_piece(board.get(x, y), self.get_cell(x, y));
        // hands
        const kinds = [Piece.Elephant, Piece.Giraffe, Piece.Chick];
        for (let k of kinds)
            for (let p of [k, Piece.opponent[k]])
                for (let h = board.hand(p); h > 0; h--)
                    move_piece(p, self.get_empty_hand(Piece.mine_p(p)));
        // state
        self.initialize_state();
        self.ui_state.board = board;
        self.update_depth();
    }

    update_depth() {
        const needs_swap = !this.is_white_turn();
        const white_board = this.revflip_maybe(this.ui_state.board, needs_swap);
        this.ui_state.depth = this.ai.search(white_board)[0];
    }

    set_random_board(depth: number) {
        if (!this.enter()) return;
        const depths = depth < 20 ? [depth] : [0, 2, 4, 6, 8].map(k => depth + k);
        this.initialize_state();
        this.set_board(this.ai.get_random_board(depths))
        this.leave();
    }

    start_autorun() {
        if (!this.enter()) return;
        const autorun = () => {
            const recur = () => this.do_master_turn_leave(autorun);
            if (this.autorun_running &&
                this.ui_state.board.gameover_status() === 0)
                // "window" to avoid this TS error.
                // error TS2322: Type 'Timeout' is not assignable to type 'number'.
                this.autorun_timer = window.setTimeout(recur);
            else
                this.stop_autorun_now_and_leave_actually();
        }
        this.analysis_mode = true;
        this.autorun_running = true;
        autorun();
    }

    stop_autorun() {
        if (this.autorun_running)
            $("body").stop(true, true).fadeTo(150, 0.1).fadeTo(150, 1);
        this.autorun_running = false;
    }

    stop_autorun_now_and_leave_actually() {
        this.autorun_running = false; // necessary for auto stop by game end
        this.autorun_timer !== null && window.clearTimeout(this.autorun_timer);
        this.autorun_timer = null;
        this.leave();
    }


    // Helpers for manipulating DOMs

    // returns a div element of the cell (x, y)
    get_cell(x: number, y: number): JQuery {
        return $("div[data-x=" + x + "][data-y=" + y + "]");
    }

    // returns a div element of the cell (x, y) and a span element of the
    // piece at the cell
    get_cell_piece(x: number, y: number): [JQuery, JQuery] {
        let cell = this.get_cell(x, y);
        let piece = cell.children();
        if (piece.length === 1) throw new Error("not found");
        return [cell, piece.last()];
    }

    // lookups the position by a div element of a cell
    get_position_from_cell(cell: JQuery): [number, number] {
        return [cell.data("x"), cell.data("y")];
    }

    // returns i-th piece in hand of the player or master
    get_hand(player: boolean, i: number) {
        return $("#" + (player ? "player" : "master") + i);
    }

    // returns an empty hand cell of the player or master
    get_empty_hand(player: boolean): JQuery | never {
        for (let i = 0; i < 6; i++) {
            let hand = this.get_hand(player, i);
            if (hand.children().length === 0) return hand;
        }
        throw new Error("not found");
    }

    // returns a hand cell at that a given piece p is
    get_hand_piece(p: Piece): [JQuery, JQuery] | never {
        for (let i = 0; i < 6; i++) {
            let hand = this.get_hand(Piece.mine_p(p), i);
            let piece = hand.children().first();
            if (piece.length === 0) continue;
            let p2 = Piece.kind(p);
            if (p2 === Piece.Hen) p2 = Piece.Chick;
            let pp = this.get_piece_id_from_piece(piece);
            if (p2 === pp) return [hand, piece];
        }
        throw new Error("not found");
    }

    // lookups a number of piece by a span element of a piece
    get_piece_id_from_piece(piece: JQuery): Piece {
        let p = piece.data("p");
        if (piece.hasClass("promoted")) p = Piece.Hen;
        return p;
    }


    // Event handlers

    dragstart(piece: JQuery) {
        const is_master_turn = this.analysis_mode && this.is_white_turn();
        const turn = is_master_turn ? "master" : "player";
        if (!piece.hasClass(turn)) return;
        if (this.ui_state.board.gameover_status() !== 0) return;
        // show droppable cells
        this.query_move(piece, {}, (move) => {
            let cell = this.get_cell(move.nx, move.ny);
            cell.droppable("enable");
            cell.addClass("possible");
            let r_nb = this.revflip_maybe(move.new_board, is_master_turn);
            let depth = this.ai.search(r_nb)[0];
            const depth_text =
                  depth < 0 ? "-" :
                  depth === 0 ? "!" :
                  depth === 1 ? "x" :
                  (typeof depth === 'number') ? depth + 1 :
                  "?"
            cell.children().first().text(depth_text);
        });
    }

    dragstop() {
        // make all cells undroppable
        $("div.cell").droppable("disable");
        $("div.cell").removeClass("possible");
        $("span.hint").text("");
    }

    drop(piece: JQuery, new_cell: JQuery) { // mouse drop
        let [nx, ny] = this.get_position_from_cell(new_cell);
        // identify and execute a move corresponding to the drop
        this.query_move(piece, { nx: nx, ny: ny }, (move) => {
            this.do_turn(move, piece);
        });
        this.dragstop();
    }

    // execute the player's turn, decide and execute the master's turn
    do_turn(move: Move, piece: JQuery) {
        if (!this.enter()) return;
        let master_p = piece.hasClass("master");
        let nb = move.new_board
        let r_nb = this.revflip_maybe(nb, master_p);
        let gameover = nb.gameover_status();
        let [depth, nnb] = (gameover === 0) ? this.ai.search(r_nb) : [-2, null];
        let nmove = nnb && !this.analysis_mode && Move.detect_move(nb, nnb);
        this.history.push([this.ui_state, move, nmove]);

        this.do_move(move, piece);
        if (!nmove || this.analysis_mode) return this.leave({ board: nb, depth: depth})
        $("span.piece").delay(300).promise().done(() => {
            this.do_move(nmove);
            this.leave({ board: nmove.new_board, depth: depth - 1 });
        });
    }

    do_master_turn_leave(cont: (() => void) | null = null) {
        let rev = !this.is_white_turn();
        let b = this.revflip_maybe(this.ui_state.board, rev);
        let [depth, nnb] = this.ai.search(b);
        let nmove = this.revflip_maybe(Move.detect_move(b, nnb), rev);
        this.history.push([this.ui_state, null, nmove]);

        $("span.piece").delay(300).promise().done(() => {
            this.do_move(nmove);
            this.leave({ board: nmove.new_board, depth: depth - 1 });
            if (cont) cont();
        });
    }


    // revoke the previous two turns (master's and player's)
    undo_turn() {
        if (!this.enter()) return;
        let prev = this.history.pop();
        if (!prev) return this.leave();
        let [prev_state, move, nmove] = prev;

        if (nmove) this.undo_move(nmove);
        $("span.piece").promise().done(() => {
            if (move) {
                this.undo_move(move);
                this.leave(prev_state);
            } else {
                this.ui_state = prev_state;
                this.swap_side_p && !this.analysis_mode ?
                    this.do_master_turn_leave() : this.leave();
            }
        });
    }

    revflip_maybe(z: Board, flag: boolean): Board;
    revflip_maybe(z: Move, flag: boolean): Move;
    revflip_maybe(z: Board | Move, flag: boolean): Board | Move {
        return flag ? z.revflip() : z
    }

    // find a possible move that satisfies a given query
    query_move(piece: JQuery, query: any, cb: (move: Move) => void) {
        const master_p = piece.hasClass("master");
        let cell = piece.parent();
        if (cell.hasClass("cell")) {
            // normal move
            let [x, y] = this.get_position_from_cell(cell);
            query.x = x;
            query.y = y;
        }
        else {
            // drop
            const p = this.get_piece_id_from_piece(piece);
            query.p = master_p ? Piece.opponent[p] : p;
        }
        const r_board = this.revflip_maybe(this.ui_state.board, master_p);
        for (let r_move of Move.possible_moves(r_board, false)) {
            const move = this.revflip_maybe(r_move, master_p);
            if (move.match_p(query)) cb(move);
        }
    }

    // start changing the state
    enter(): boolean {
        if (this.locked) return false;
        this.locked = true;
        $("span#msg").text("計算中……");
        $("span.piece").draggable("disable");
        $("p#dead-msg").hide();
        $("p#won-msg").hide();
        $("span#master").addClass("thinking");
        return true;
    }

    // stop changing the state
    leave(s: UIState | undefined = undefined) {
        const dont_leave_actually = this.autorun_running; // ugly logic...
        if (s) this.ui_state = s;
        let d = this.ui_state.depth;
        const gameover = this.ui_state.board.gameover_status();
        $("span#player").removeClass();
             if (gameover > 0) $("span#player").addClass("win");
        else if (gameover < 0) $("span#player").addClass("level6");
        else if (d < 0) $("span#player").addClass("draw");
        else if (d % 2 !== 0) $("span#player").addClass("level1");
        else if (d >= 70) $("span#player").addClass("level1");
        else if (d >= 40) $("span#player").addClass("level2");
        else if (d >= 20) $("span#player").addClass("level3");
        else if (d >= 10) $("span#player").addClass("level4");
        else if (d >=  2) $("span#player").addClass("level5");
        else if (d === 0) $("span#player").addClass("level6");
        const msg = [
            "トライされた", "ライオン取られた",
            null,
            "ライオン取った", "トライした",
        ][gameover + 2];
        if (msg) {
            $("span#msg").text(msg);
            if (gameover > 0) {
                $("p#won-msg").show();
                $("span#about-image").removeClass("dead");
            } else {
                $("p#dead-msg").show();
                $("span#about-image").addClass("dead");
            }
            $("span#last").text($("#record").children().length);
        }
        else {
            $("span#msg").text("あと" + (d >= 0 ? d : "∞") + "手");
            if (d <= 10) $("#player").addClass("dying");
            $("span#about-image").removeClass("dead");
        }
        $("span#master-text").text(this.analysis_mode && !this.autorun_running ? "あなた" : "どうぶつしょうぎ名人'");
        if (this.is_white_turn()) {
            $(".piece.master").draggable("enable");
            $(".piece.player").draggable("disable");
        } else {
            $(".piece.master").draggable("disable");
            $(".piece.player").draggable("enable");
        }
        $("span#master").removeClass("thinking");
        const master_to_play = this.analysis_mode && this.is_white_turn();
        $(".player").toggleClass("to-play", gameover === 0 && !master_to_play);
        $(".master").toggleClass("to-play", gameover === 0 && master_to_play);
        $("span#player").toggleClass("opposite", gameover === 0 && master_to_play);
        const url = new URL(window.location.href);
        const r_board = this.revflip_maybe(this.ui_state.board, this.is_white_turn());
        url.searchParams.set("board", r_board.hashstr());
        $("a#permalink").attr("href", url.toString());
        if (dont_leave_actually) return;
        this.locked = false;
    }

    // move a span element of a piece with animation
    animate_piece(piece: JQuery, old_place: JQuery, new_place: JQuery, fast: boolean) {
        new_place.append(piece);
        let { left: old_off_x  , top: old_off_y   } = old_place.offset()!;
        let { left: new_off_x  , top: new_off_y   } = new_place.offset()!;
        let { left: piece_off_x, top: piece_off_y } = piece.offset()!;
        let size = "" + (new_place.hasClass("hand") ? 0.5 : 1.0) + "em";
        piece.offset({
            left: piece_off_x - new_off_x + old_off_x,
            top : piece_off_y - new_off_y + old_off_y
        }).animate({ left: 0, top: 0, fontSize: size }, fast ? 200 : 300);
    }

    // perform a move forward
    do_move(move: Move, piece: JQuery | undefined = undefined) {
        let new_cell = this.get_cell(move.nx, move.ny);
        if (move instanceof Normal) {
            if (move.captured_piece() !== Piece.Empty) {
                // move a captured piece into hand
                let [new_cell, piece] = this.get_cell_piece(move.nx, move.ny);
                let hand = this.get_empty_hand(piece.hasClass("master"));
                this.animate_piece(piece, new_cell, hand, false);

                // a captured piece becomes the opponent's, promotion is revoked
                piece.toggleClass("master");
                piece.toggleClass("player");
                piece.removeClass("promoted");
            }

            // move a piece
            let [old_cell, piece] = this.get_cell_piece(move.x, move.y);
            if (move.promotion_p()) piece.addClass("promoted");
            this.animate_piece(piece, old_cell, new_cell, false);
        }
        else {
            // drop a piece
            let [hand, piece_] = piece ? [piece.parent(), piece] : this.get_hand_piece(move.p);
            this.animate_piece(piece_, hand, new_cell, false);
        }

        // add a entry to the record
        let s1 = move.toString(this.swap_side_p);
        let s2 = $("ol#record").children().last().text();
        if (s1.substring(1, 3) === s2.substring(1, 3))
            s1 = s1[0] + "同" + s1.substr(3);
        $("ol#record").append($("<li>").addClass(piece ? "player-text" : "master-text").text(s1));
    }

    // perform a move backward
    undo_move(move: Move) {
        let [new_cell, piece] = this.get_cell_piece(move.nx, move.ny);
        if (move instanceof Normal) {
            // undo a move of a piece
            let old_cell = this.get_cell(move.x, move.y);
            if (move.promotion_p()) piece.removeClass("promoted");
            this.animate_piece(piece, new_cell, old_cell, true);

            let p = move.captured_piece();
            if (p !== Piece.Empty) {
                // move a captured piece back
                let [hand, piece] = this.get_hand_piece(Piece.opponent[p]);
                this.animate_piece(piece, hand, new_cell, true);

                // a captured piece becomes the opponent's, promoted back if needed
                piece.toggleClass("master");
                piece.toggleClass("player");
                if (Piece.kind(p) === Piece.Hen) piece.addClass("promoted");
            }
        }
        else {
            // undo a drop
            let hand = this.get_empty_hand(piece.hasClass("player"));
            this.animate_piece(piece, new_cell, hand, true);
        }

        // remove a record entry
        $("ol#record").children().last().detach();
    }
}

// テストしたい手順
//   にわとりになる
//   トライで負ける
//   にわとり取られる
//   持ち駒が 6 個になる
