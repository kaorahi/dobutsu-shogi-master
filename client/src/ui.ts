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
import {CsaIO} from "./csa_io";
import {EditModeController} from "./edit_mode";
import {Move, Normal, Drop} from "./move";

type UIState = { board: Board, depth: number | null };

type Snapshot = [
    UIState,
    [UIState, Move | null | false, Move | null | false][],
    [UIState, Move | null | false, Move | null | false][],
    boolean,
    boolean,
];

export class UI {
    // the current board and its depth
    ui_state: UIState;

    // (the previous state, player's (black) move, master's (white) move)*
    history: [UIState, Move | null | false, Move | null | false][];
    future: [UIState, Move | null | false, Move | null | false][];

    // a mutex to change the state
    locked: boolean;

    analysis_mode = false;
    edit_mode = false;
    swap_side_p = false;
    show_depth_p = true;
    puzzle_depth = -1;
    autorun_timer: number | null = null;
    autorun_running = false;
    snapshots: Snapshot[] = [];
    csa_io: CsaIO;
    edit_controller: EditModeController;

    is_white_turn(): boolean {
        const xor = (a: boolean, b: boolean): boolean => !!a !== !!b;
        return xor(this.swap_side_p, this.current_move_count() % 2 !== 0);
    }

    constructor(public ai: AI, init_game_txt: string) {
        this.initialize_state();
        this.csa_io = new CsaIO(this);
        this.edit_controller = new EditModeController(this);

        this.ui_state.board.update_rules(ai.rules);
        $("span#rules").text(ai.rules);
        $("li#rules-help").toggle(!ai.rules.match(/^val1nT?$/));
        $("li#rules-try").toggle(!!ai.rules.match(/^.....T$/));

        $("span.piece").draggable({
            start: (event, ui) => { this.dragstart($(event.target) as JQuery<HTMLElement>); },
            stop: (event, ui) => { this.dragstop($(event.target) as JQuery<HTMLElement>); },
            revert: "invalid",
            revertDuration: 300,
            zIndex: 1000,
            scroll: false
        });
        $("div.cell").droppable({
            drop: (event, ui) => { this.drop(ui.draggable, $(event.target) as JQuery<HTMLElement>); },
            over: (event, ui) => { this.edit_controller.highlightDropTarget($(event.target) as JQuery<HTMLElement>); },
            out: (event, ui) => { this.edit_controller.clearDropTarget($(event.target) as JQuery<HTMLElement>); },
        });
        $("div.hand").droppable({
            drop: (event, ui) => { this.drop(ui.draggable, $(event.target) as JQuery<HTMLElement>); },
            over: (event, ui) => { this.edit_controller.highlightDropTarget($(event.target) as JQuery<HTMLElement>); },
            out: (event, ui) => { this.edit_controller.clearDropTarget($(event.target) as JQuery<HTMLElement>); },
        });

        $("ol#record").on("click", "li", (e) => {
            this.goto_history_len($(e.currentTarget).data("history-len"));
        });

        $("button").button();
        $("button#matta").click((e) => this.undo_turn(true));
        $("button#undo").click((e) => this.undo_turn());
        $("button#redo").click((e) => this.redo_turn());
        $("#record-before-first").click((e) => this.goto_history_len(0));
        $("button#about").click((e) => {
            $("#about-dialog").click((e) => e.stopPropagation());
            $("#about-overlay").fadeIn("fast").off().click(() => {
                $("#about-overlay").fadeOut("fast");
            });
        });
        $("#control-dialog button").click((e) => $("#control-overlay").fadeOut("fast"));
        $("button#show-control").click((e) => {
            $("#control-dialog").click((e) => e.stopPropagation());
            $("#control-overlay").fadeIn("fast").off().click(() => {
                $("#control-overlay").fadeOut("fast");
            });
        });
        $("button#copy").click((e) => this.csa_io.copyToClipboard());
        $("button#prev-board").click((e) => this.rotate_snapshot(true));
        $("button#next-board").click((e) => this.rotate_snapshot());

        $("button#new-game").click((e) => this.restore_positions(false));
        $("button#enter-edit-mode").click((e) => this.edit_controller.enterEditMode());
        $("button#confirm-edit-mode").click((e) => this.edit_controller.confirmEditMode());
        $("button#edit-revflip").click((e) => this.edit_controller.revflipBoard());
        $("button#edit-flip").click((e) => this.edit_controller.flipBoard());
        $("button#swap").click((e) => this.restore_positions(true));
        $("button#analysis-mode").click((e) => {
            if (!this.enter()) return;
            if (!this.analysis_mode)
                this.take_snapshot();
            this.analysis_mode = true;
            this.leave();
        });
        $("button#toggle-depth").click((e) => {
            if (!this.enter()) return;
            this.show_depth_p = !this.show_depth_p;
            this.leave();
        });
        $("button#autorun").click((e) => this.start_autorun());
        // click anywhere to stop autorun
        document.addEventListener("click", (e) => this.stop_autorun(), {capture: true});
        $(document).on("keydown", (e) => {
            this.stop_autorun();
            if (e.key === "Escape") this.edit_controller.closeContextMenu();
            const target = e.originalEvent?.target;
            if (!(target instanceof Element)) return;
            if (target.closest("input, textarea, [contenteditable='true']")) return;
            if (this.edit_mode) return;
            switch (e.key) {
            case '<': case ',': this.undo_turn(); break;
            case '>': case '.': this.redo_turn(); break;
            case '[': this.rotate_snapshot(true); break;
            case ']': this.rotate_snapshot(); break;
            }
        });
        $(document).on("paste", (e) => this.csa_io.loadFromClipboard(e));
        $(document).on("click", (e) => {
            const target = e.originalEvent?.target;
            if (!(target instanceof Element) || !target.closest("#piece-menu"))
                this.edit_controller.closeContextMenu();
        });
        $("span.piece").on("contextmenu", (e) => this.edit_controller.openContextMenu($(e.currentTarget), e));
        $("#piece-menu").on("click", "button", (e) => {
            const action = String($(e.currentTarget).data("action"));
            this.edit_controller.applyContextMenuAction(action);
        });
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
        this.set_board(this.initial_board(), true);
        this.update_depth();
        this.leave();
        init_game_txt && this.csa_io.loadFromText(init_game_txt);
    }

    initialize_state() {
        this.analysis_mode = false;
        this.edit_mode = false;
        this.set_swap_side_p(false);
        this.ui_state = { board: Board.init(), depth: null };
        this.history = [];
        this.clear_future();
    }

    clear_future(snapshot_p = false) {
        if (snapshot_p && this.future.length > 0)
            this.take_snapshot();
        this.future = [];
        $("ol#record").children().slice(this.current_move_count()).detach();
    }

    restore_positions(swap_side: boolean) {
        if (!this.enter()) return;
        this.edit_controller.closeContextMenu();
        this.set_board(this.revflip_maybe(this.initial_board(), swap_side));
        this.set_swap_side_p(swap_side);
        swap_side ? this.do_master_turn_leave() : this.leave();
    }

    set_swap_side_p(swap_side: boolean) {
        this.swap_side_p = swap_side;
        if (swap_side) {
            $("#player-side-mark").text("△");
            $("#master-side-mark").text("▲");
        } else {
            $("#player-side-mark").text("▲");
            $("#master-side-mark").text("△");
        }
    }

    initial_board(): Board {
        const s = new URLSearchParams(window.location.search).get("board");
        return s ? Board.from_hashstr(s) : Board.init();
    }

    set_board(board: Board, keep_history_p = false) {
        const snapshot_p = (this.history.length + this.future.length > 0) ||
              this.ui_state.board.hashstr() !== this.initial_board().hashstr();
        !keep_history_p && snapshot_p && this.take_snapshot();
        const self = this;
        const gameover_status = board.gameover_status();
        let rest = $("span.piece");
        // to avoid unnecessary swaps...
        // (1) exclude unmoved pieces from board and rest
        const [board1, rest1] = self.set_board_sub(board, rest, gameover_status, true);
        // (2) then move rest pieces
        self.set_board_sub(board1, rest1, gameover_status, false);
        // state
        keep_history_p || self.initialize_state();
        self.ui_state = { board, depth: null };
        self.update_depth();
    }

    set_board_sub(board: Board, rest: JQuery, gameover_status: number, staying_only: boolean): [Board, JQuery] {
        const self = this;
        const kind_class = (piece: Piece): string => {
            const never_match = ":not(*)";  // for Piece.Empty
            return [
                never_match, ".lion", ".elephant", ".giraffe",
                ".chick,.hen", ".chick,.hen",
            ][Piece.kind(piece)];
        }
        const move_piece = (piece: Piece, place: JQuery): boolean => {
            let spans = rest.filter(kind_class(piece));
            if (staying_only)
                spans = spans.filter((_, elem) => place.is($(elem).parent()));
            if (spans.length === 0) return false;
            const span = spans.first();
            const parent = span.parent();
            rest = rest.not(span);
            !place.is(parent) && self.animate_piece(span, parent, place, true);
            const mine_p = Piece.mine_p(piece);
            span.toggleClass("master", !mine_p);
            span.toggleClass("player", mine_p);
            span.toggleClass("promoted", Piece.kind(piece) === Piece.Hen);
            return true;
        }
        const move_to_hand = (piece: Piece): boolean => {
            const mine_p = Piece.mine_p(piece);
            const mine_class = mine_p ? ".player" : ".master";
            const expand = (orig: string) => `.hand ${orig}${mine_class}`;
            const expanded_selector = kind_class(piece).split(",").map(expand).join(",");
            const span = rest.filter(expanded_selector).first();
            const place = (span.length > 0) ? span.parent() : self.get_empty_hand(mine_p);
            return move_piece(piece, place);
        }
        // cells
        for (const x of [0, 1, 2])
            for (const y of [0, 1, 2, 3])
                move_piece(board.get(x, y), self.get_cell(x, y)) &&
                    (board = board.del(x, y));
        // hands
        const kinds = [Piece.Elephant, Piece.Giraffe, Piece.Chick];
        for (let k of kinds)
            for (let p of [k, Piece.opponent[k]])
                for (let h = board.hand(p); h > 0; h--)
                    move_to_hand(p) && (board = board.dec_hand(p));
        // lion is missing in "board" if captured
        switch (!staying_only && gameover_status) {
        case -1:  // master wins (capture)
            move_to_hand(Piece.opponent[Piece.Lion]);
            break;
        case +1:  // player wins (capture)
            move_to_hand(Piece.Lion);
            break;
        }
        return [board, rest];
    }

    update_depth() {
        const needs_swap = !this.is_white_turn();
        const white_board = this.revflip_maybe(this.ui_state.board, needs_swap);
        this.ui_state.depth = this.ai.search(white_board)[0];
    }

    set_random_board(depth: number) {
        if (!this.enter()) return;
        const depths = depth < 20 ? [depth] : [0, 2, 4, 6, 8].map(k => depth + k);
        this.set_board(this.ai.get_random_board(depths))
        this.show_depth_p = false;
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
        this.take_snapshot();
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

    // snapshot

    rotate_snapshot(backward = false) {
        const popped = backward ? this.snapshots.pop() : this.snapshots.shift();
        if (!popped) return;
        this.take_snapshot(backward);
        this.restore_snapshot(popped);
    }

    take_snapshot(backward = false) {
        const s: Snapshot = [
            this.ui_state,
            this.history.slice(),
            this.future.slice(),
            this.analysis_mode,
            this.swap_side_p,
        ];
        backward ? this.snapshots.unshift(s) : this.snapshots.push(s);
    }

    restore_snapshot(s: Snapshot) {
        if (!this.enter()) return;
        this.initialize_state();
        this.ui_state = s[0];
        this.history = s[1];
        this.future = s[2];
        this.analysis_mode = s[3];
        this.set_swap_side_p(s[4]);
        this.set_board(this.ui_state.board, true);
        let prev_li: JQuery<HTMLElement> | null = null;
        const hs = [...this.history, ...this.future.toReversed()];
        hs.forEach(([_, move, nmove], k) => {
            move && (prev_li = this.add_to_record(move, prev_li, k + 1));
            nmove && (prev_li = this.add_to_record(nmove, prev_li, k + 1));
        });
        this.update_records();
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
        for (let i = 0; i < 8; i++) {
            let hand = this.get_hand(player, i);
            if (hand.children().length === 0) return hand;
        }
        throw new Error("not found");
    }

    // returns a hand cell at that a given piece p is
    get_hand_piece(p: Piece): [JQuery, JQuery] | never {
        for (let i = 0; i < 8; i++) {
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
        if (this.edit_mode) {
            this.edit_controller.dragstart(piece);
            return;
        }
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
                  !this.show_depth_p ? "" :
                  depth < 0 ? "-" :
                  depth === 0 ? "!" :
                  depth === 1 ? "x" :
                  (typeof depth === 'number') ? depth + 1 :
                  "?"
            cell.children().first().text(depth_text);
        });
    }

    dragstop(piece?: JQuery) {
        // make all cells undroppable
        $("div.cell").droppable("disable");
        $("div.hand").droppable("disable");
        $("div.cell, div.hand").removeClass("possible");
        this.edit_controller.clearDropTarget();
        $("span.hint").text("");
        if (this.edit_mode && piece) {
            const place = piece.parent();
            piece.css("fontSize", place.hasClass("hand") ? "0.5em" : "1em");
        }
    }

    drop(piece: JQuery, new_cell: JQuery) { // mouse drop
        if (this.edit_mode) {
            this.edit_controller.drop(piece, new_cell);
            this.dragstop();
            return;
        }
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
        this.clear_future(true);
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
        this.clear_future(true);
        this.history.push([this.ui_state, null, nmove]);

        $("span.piece").delay(300).promise().done(() => {
            this.do_move(nmove);
            this.leave({ board: nmove.new_board, depth: depth - 1 });
            if (cont) cont();
        });
    }


    // revoke the previous two turns (master's and player's)
    undo_turn(destructive: boolean = false) {
        if (!this.enter()) return;
        let prev = this.history.pop();
        if (!prev) return this.leave();
        this.future.push(prev);
        let [prev_state, move, nmove] = prev;

        if (nmove) this.undo_move(nmove);
        $("span.piece").promise().done(() => {
            if (move) {
                this.undo_move(move);
                this.leave(prev_state);
            } else {
                this.ui_state = prev_state;
                this.swap_side_p && !this.analysis_mode && destructive ?
                    this.do_master_turn_leave() : this.leave();
            }
        });
    }

    redo_turn() {
        if (!this.enter()) return;
        this.redo_turn_leave();
    }

    redo_turn_leave() {
        let next = this.future.pop();
        if (!next) return this.leave();
        this.history.push(next);
        let [_cur_state, move, nmove] = next;

        if (move) {
            this.redo_move(move);
            this.ui_state = { board: move.new_board, depth: -1 };
        }
        $("span.piece").promise().done(() => {
            if (nmove) {
                this.redo_move(nmove);
                this.ui_state = { board: nmove.new_board, depth: -1 };
            }
            this.update_depth();
            this.leave();
        });
    }

    goto_history_len(n: number) {
        if (!this.enter()) return;
        this.goto_history_len_leave(n);
    }
    goto_history_len_leave(n: number) {
        const hs = [...this.history, ...this.future.toReversed()];
        const prev = Math.max(n - 1, 0);
        this.history = hs.slice(0, prev);
        this.future = hs.slice(prev).reverse();
        const b = this.future.at(-1)?.[0].board;
        if (!b) return this.leave();
        this.set_board(b, true);
        $("span.piece").promise().done(() => {
            this.update_records();
            n > 0 ? this.redo_turn_leave() : this.leave();
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
        if (!this.edit_mode && this.ui_state.depth === null) this.update_depth();
        let d = this.ui_state.depth as number;
        const gameover = this.ui_state.board.gameover_status();
        $("span#player").removeClass();
        if (this.edit_mode) $("span#player").addClass("draw");
        else if (gameover > 0) $("span#player").addClass("win");
        else if (gameover < 0) $("span#player").addClass("level6");
        else if (d < 0 || !this.show_depth_p) $("span#player").addClass("draw");
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
            const rest = !this.show_depth_p ? "？" : d >= 0 ? d : "∞";
            $("span#msg").text("あと" + rest + "手");
            if (d <= 10) $("#player").addClass("dying");
            $("span#about-image").removeClass("dead");
        }
        $("span#master-text").text(this.analysis_mode && !this.autorun_running ? "あなた" : "どうぶつしょうぎ名人'");
        if (this.edit_mode) {
            $(".piece").draggable("enable");
        }
        else if (this.is_white_turn()) {
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
        $("span#player").toggleClass("opposite", !this.edit_mode && gameover === 0 && master_to_play);
        const url = new URL(window.location.href);
        const r_board = this.revflip_maybe(this.ui_state.board, this.is_white_turn());
        url.searchParams.set("board", r_board.hashstr());
        $("a#permalink").attr("href", url.toString());
        if (this.edit_mode) {
            $("#record-box").children().hide();
            $("#record-controls").show();
            $("#record-controls").children().hide();
            $(".edit-mode-only, .edit-mode-too").show();
            $("button").prop("disabled", true);
            $(".edit-mode-only *, #piece-menu button, #toggle-depth").prop("disabled", false);
            $(".player, .master").toggleClass("to-play", true);
        } else {
            $("#record-box").children().show();
            $("#record-controls").children().show();
            $("#record-controls .edit-mode-only").hide();
            if (this.ai.supports_best_move_only())
                $("button#swap, button#puzzle, .puzzle-button, button#analysis-mode, button#autorun").hide();
            $("button").prop("disabled", false);
            $("button#matta").prop("disabled", this.history.length === 0);
            $("button#undo").prop("disabled", this.history.length === 0);
            $("button#redo").prop("disabled", this.future.length === 0);
            $("button#prev-board").prop("disabled", this.snapshots.length === 0);
            $("button#next-board").prop("disabled", this.snapshots.length === 0);
            $("#puzzle-container").toggle(this.puzzle_depth > 0);
        }
        $("#move-count").text(this.current_move_count());
        const puzzle_label = $("button#puzzle" + this.puzzle_depth).text();
        $("button#puzzle").text(`次問（${puzzle_label}）`);
        $("button#toggle-depth").toggleClass("highlight", !this.show_depth_p);
        if (dont_leave_actually) return;
        this.locked = false;
    }

    // move a span element of a piece with animation
    animate_piece(piece: JQuery, old_place: JQuery, new_place: JQuery, fast: boolean) {
        function size_for(is_hand: boolean): string {
            return "" + (is_hand ? 0.5 : 1.0) + "em";
        }
        let size = size_for(old_place.hasClass("hand") || new_place.hasClass("hand"));
        let final_size = size_for(new_place.hasClass("hand"));
        piece.css("fontSize", size);
        let start = piece.offset()!;
        new_place.append(piece);
        piece.offset({
            left: start.left,
            top : start.top
        }).animate({ left: 0, top: 0 }, fast ? 200 : 300,
                   () => piece.css("fontSize", final_size));
    }

    // perform a move forward
    do_move(move: Move, piece: JQuery | undefined = undefined) {
        this.do_move_sub(move, piece);
        this.add_to_record(move);
    }

    add_to_record(move: Move, prev_li?: JQuery<HTMLElement> | null, history_len: number | null = null): JQuery<HTMLElement> {
        // add a entry to the record
        if (!prev_li)
            prev_li = $("ol#record").children().last();
        let s1 = move.toString(this.swap_side_p);
        let s2 = prev_li.data("full-text") || "";
        let s = s1;
        if (s1.substring(1, 3) === s2.substring(1, 3))
            s = s1[0] + "同" + s1.substr(3);
        let n = (history_len === null) ? this.history.length : history_len;
        const li = $("<li>").text(s).data("full-text", s1).data("history-len", n);
        $("ol#record").append(li);
        return li;
    }

    redo_move(move: Move) {
        this.do_move_sub(move);
        this.update_records();
    }

    do_move_sub(move: Move, piece: JQuery | undefined = undefined) {
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

        this.update_records();
    }

    update_records() {
        if (this.history.length + this.future.length > 10000) return;
        const mc = this.current_move_count();
        const records = $("ol#record").children();
        records.slice(0, mc).removeClass("future-move");
        records.slice(mc).addClass("future-move");
    }

    current_move_count(): number {
        const f = (m: Move | null | false): number => (m ? 1 : 0);
        return this.history.reduce((acc, [_s, m, nm]) => acc + f(m) + f(nm), 0);
    }
}

// テストしたい手順
//   にわとりになる
//   トライで負ける
//   にわとり取られる
//   持ち駒が 6 個になる
