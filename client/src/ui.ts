import "jquery-ui/dist/jquery-ui";
import "jquery-ui/themes/base/core.css";
import "jquery-ui/themes/base/button.css";
import "jquery-ui/themes/base/draggable.css";
import "jquery-ui/themes/base/tooltip.css";

// Hack to enable touch-punch for pointer device (e.g., Surface)
if ('onpointerenter' in window) {
  document["ontouchend"] = ((ev: TouchEvent) => void 0);
}

import "jquery-ui-touch-punch/jquery.ui.touch-punch";

import {Board, Piece, Result, isResult} from "./board";
import {Move, Normal, Drop} from "./move";
import {AI} from "./ai";
import {CsaIO} from "./csa_io";
import {EditModeController} from "./edit_mode";
import {get_color} from "./colormap";
import {
    format_principal_variation,
    get_hover_pv_move,
} from "./ui_pv";

type UIState = { board: Board, depth: number | null };

export type UIHistoryItem = [UIState, Move, number | null];

type Snapshot = [
    string,
    UIState,
    UIHistoryItem[],
    UIHistoryItem[],
    boolean,
    boolean,
];

export class UI {
    // the current board and its depth
    ui_state: UIState;

    // (the state before move, move, depth after move)*
    history: UIHistoryItem[];
    future: UIHistoryItem[];

    // a mutex to change the state
    locked: boolean;

    analysis_mode = false;
    edit_mode = false;
    swap_side_p = false;
    pv_hover_move: Move | null = null;
    pv_drag_piece: JQuery | null = null;
    puzzle_depth = -1;
    autorun_running = false;
    snapshots: Snapshot[] = [];
    snapshot_id = this.get_snapshot_id();
    csa_io: CsaIO;
    edit_controller: EditModeController;

    is_white_turn(): boolean {
        const xor = (a: boolean, b: boolean): boolean => !!a !== !!b;
        return xor(this.swap_side_p, this.history.length % 2 !== 0);
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
        $("span.piece").on("pointerenter", e => this.hover_on_piece($(e.currentTarget) as JQuery<HTMLElement>));
        $("span.piece").on("pointerleave pointercancel lostpointercapture", e => {
            if ($(".ui-draggable-dragging").length > 0) return;
            this.hide_hints();
            $(e.currentTarget).hasClass("to-play") &&
                this.update_principal_variation_display();
        });
        $("div.cell").droppable({
            tolerance: "pointer",
            drop: (event, ui) => { this.drop(ui.draggable, $(event.target) as JQuery<HTMLElement>, event); },
            over: (event, ui) => {
                $("div.cell, div.hand").removeClass("drop-current");
                $(event.target).addClass("drop-current");
                this.update_drag_pv(ui.draggable as JQuery<HTMLElement>, $(event.target) as JQuery<HTMLElement>);
            },
            out: (event, ui) => {
                $(event.target).removeClass("drop-current");
                queueMicrotask(() =>
                    $("div.cell.drop-current, div.hand.drop-current").length === 0 &&
                        this.clear_drag_p(ui.draggable as JQuery<HTMLElement>));
            },
        });
        $("div.hand").droppable({
            tolerance: "pointer",
            drop: (event, ui) => { this.drop(ui.draggable, $(event.target) as JQuery<HTMLElement>, event); },
            over: (event, ui) => {
                $("div.cell, div.hand").removeClass("drop-current");
                $(event.target).addClass("drop-current");
            },
            out: (event, ui) => { $(event.target).removeClass("drop-current"); },
        });

        $("ol#record").on("click", "li", (e) => {
            this.goto_history_len($(e.currentTarget).index() + 1);
        });

        $("button").button();
        $("button#matta").click((e) => this.matta());
        $("button#hint").click((e) => this.highlight_best_move_piece());
        $("button#undo").click((e) => this.undo_turn());
        $("button#redo").click((e) => this.redo_turn());
        $("button#best-move").click((e) => this.play_best_move());
        $("span#msg").click((e) => $("span#msg").removeClass("censored"));
        $("#record-before-first").click((e) => this.goto_history_len(0));
        $("button#about").click((e) => {
            $("#control-overlay").fadeOut("fast");
            $("#about-overlay").fadeIn("fast");
        });
        $("#about-dialog").click((e) => e.stopPropagation());
        const close_dialogs = () => $(".dialog-overlay").fadeOut("fast");
        $("#about-overlay").click(close_dialogs);
        $("#control-dialog button:not(#about)").click(close_dialogs);
        $("button#show-control").click((e) => {
            $("#control-dialog input").val("");
            $("#control-overlay").fadeIn("fast");
        });
        $("#control-dialog").click((e) => e.stopPropagation());
        $("#control-overlay").click(close_dialogs);
        $("button#copy").click((e) => this.csa_io.copyToClipboard());
        $("button#download").click((e) => {
            const text = this.csa_io.toText();
            const yymmdd_HHMMSS = new Date().toISOString().slice(2, 19).replace(/[-:]/g, '').replace('T', '-');
            const filename = `dobutsu-shogi-${yymmdd_HHMMSS}.txt`;
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        });
        $('#load').on('click', () => $('#load-input').trigger('click'));
        $('#load-input').on('change', (e) => {
            const input = e.target as HTMLInputElement
            input.files?.[0].text().then(text => this.csa_io.loadFromText(text));
            $(input).val('');
        });
        $("button#copy-url").click((e) => {
            const url = new URL(window.location.href);
            url.searchParams.set("board", this.board_hashstr());
            const url_str = url.toString();
            this.csa_io.copyToClipboard(url_str);
            toast(url_str, 5000);
        });
        $("button#prev-board").click((e) => this.rotate_snapshot(true));
        $("button#next-board").click((e) => this.rotate_snapshot());

        $("button#new-game").click((e) => this.restore_positions());
        $("button#enter-edit-mode").click((e) => this.edit_controller.enterEditMode());
        $("button#confirm-edit-mode").click((e) => this.edit_controller.confirmEditMode());
        $("button#edit-revflip").click((e) => this.edit_controller.revflipBoard());
        $("button#edit-flip").click((e) => this.edit_controller.flipBoard());
        $("#analysis-ckbox").on("change", () => {
            if (!this.enter()) return;
            this.analysis_mode = $("#analysis-ckbox").prop("checked");
            this.hide_hints();
            this.leave();
        });
        $("#swap-ckbox").on("change", () => this.swap_view($("#swap-ckbox").prop("checked")));
        $("input[type=checkbox]").on("click change", (e) => e.currentTarget.blur());
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
        $(document).on("paste", (e) => {
            this.csa_io.loadFromClipboard(e);
            close_dialogs();
        });
        $(document).on("click", (e) => {
            const target = e.originalEvent?.target;
            if (!(target instanceof Element) || !target.closest("#piece-menu"))
                this.edit_controller.closeContextMenu();
        });
        $("#piece-menu").on("click", "button", (e) => {
            const action = String($(e.currentTarget).data("action"));
            this.edit_controller.applyContextMenuAction(action);
        });
        $("button#puzzle").click((e) =>
            this.set_random_board(this.puzzle_depth));
        $('#puzzle-select').on('change', (e) => {
            const target = $('#puzzle-select option:selected');
            const puzzle_label = target.text();
            const d = Number(target.val());
            if (d < 0) return;
            $('#puzzle-select').prop('selectedIndex', 0);
            $("button#puzzle").html(`<span class="nowrap">次問</span><wbr><span class="nowrap">（${puzzle_label}）</br>`);
            this.set_random_board(this.puzzle_depth = d);
            close_dialogs();
        });
        $("button#reveal-eval").click((e) => {
            this.update_records(true);
            $(e.currentTarget).css("visibility", "hidden");
        });
        this.dragstop();

        this.enter();
        this.set_board(this.initial_board(true), true);
        this.update_depth();
        this.leave();
        init_game_txt && this.csa_io.loadFromText(init_game_txt);
    }

    initialize_state() {
        this.analysis_mode = false;
        this.edit_mode = false;
        this.swap_side_p = false;
        this.pv_hover_move = null;
        this.ui_state = { board: Board.init(), depth: null };
        this.history = [];
        this.clear_future();
    }

    clear_future(snapshot_p = false) {
        if (snapshot_p && this.future.length > 0)
            this.take_snapshot();
        this.future = [];
        const lis = $("ol#record").children().slice(this.history.length);
        lis.filter(":data(ui-tooltip)").tooltip("destroy");
        lis.remove();
    }

    restore_positions() {
        if (!this.enter()) return;
        const swap_p = this.swap_side_p;
        this.edit_controller.closeContextMenu();
        this.set_board(this.revflip_maybe(this.initial_board(), swap_p));
        this.swap_side_p = swap_p;  // reset by set_board
        swap_p ? this.do_master_turn_leave() : this.leave();
    }

    initial_board(from_url = false): Board {
        const s = from_url && new URLSearchParams(window.location.search).get("board");
        return s ? Board.from_hashstr(s) : Board.init();
    }

    fresh_game_p(init_board: Board): boolean {
        return (this.history.length + this.future.length === 0) &&
            this.ui_state.board.hashstr() === init_board.hashstr();
    }

    set_board(board: Board, keep_history_p = false, keep_state_p = false) {
        this.hide_hints();
        !keep_history_p && !this.fresh_game_p(this.initial_board()) && this.take_snapshot();
        const self = this;
        const gameover_status = board.gameover_status();
        let rest = $("span.piece");
        // to avoid unnecessary swaps...
        // (1) exclude unmoved pieces from board and rest
        const [board1, rest1] = self.set_board_sub(board, rest, gameover_status, true);
        // (2) then move rest pieces
        self.set_board_sub(board1, rest1, gameover_status, false);
        // state
        const {analysis_mode, swap_side_p} = self;  // cleared in initialize_state
        keep_history_p || self.initialize_state();
        keep_state_p && Object.assign(self, {analysis_mode, swap_side_p});
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
        const {board, depth} = this.ui_state;
        const needs_swap = !this.is_white_turn();
        const white_board = this.revflip_maybe(board, needs_swap);
        this.ui_state = {board, depth: this.ai.search_depth(white_board)};
    }

    set_random_board(depth: number) {
        if (!this.enter()) return;
        const depths = depth < 20 ? [depth] : [0, 2, 4, 6, 8].map(k => depth + k);
        this.set_board(this.ai.get_random_board(depths))
        this.leave();
    }

    swap_view(swap_p: boolean) {
        if (this.swap_side_p === swap_p) return;
        if (!this.enter()) return;
        const swap_h = ([s, m, d]: UIHistoryItem): UIHistoryItem =>
              [{...s, board: s.board.revflip()}, m.revflip(), d];
        this.history = this.history.map(swap_h);
        this.future = this.future.map(swap_h);
        this.swap_side_p = swap_p;
        this.set_board(this.ui_state.board.revflip(), true);
        this.leave();
    }

    start_autorun() {
        if (!this.enter()) return;
        this.take_snapshot();
        this.analysis_mode = true;
        this.autorun_running = true;
        this.do_autorun_leave();
    }

    do_autorun_leave() {
        if (this.ui_state.board.gameover_status() !== 0)
            this.autorun_running = false;
        if (!this.autorun_running) return this.leave();
        this.do_master_turn_now();
        this.update_ui();
        this.update_records();
        $("span.piece").promise().done(() => this.do_autorun_leave());
    }

    stop_autorun() {
        if (this.autorun_running)
            $("body").stop(true, true).fadeTo(150, 0.1).fadeTo(150, 1);
        this.autorun_running = false;
    }

    // snapshot

    rotate_snapshot(backward = false) {
        const popped = backward ? this.snapshots.pop() : this.snapshots.shift();
        if (!popped) return;
        this.push_snapshot(backward);
        this.restore_snapshot(popped);
    }

    take_snapshot() {
        this.push_snapshot();
        this.snapshot_id = this.get_snapshot_id();
        toast(this.snapshot_id);
    }

    push_snapshot(backward = false) {
        const s: Snapshot = [
            this.snapshot_id,
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
        const id = s[0];
        this.ui_state = s[1];
        this.history = s[2];
        this.future = s[3];
        this.analysis_mode = s[4];
        this.swap_side_p = s[5];
        this.set_board(this.ui_state.board, true);
        let prev_li: JQuery<HTMLElement> | null = null;
        const hs = [...this.history, ...this.future.toReversed()];
        hs.forEach(([_s, move, _d]) => {
            move && (prev_li = this.add_to_record(move, prev_li));
        });
        this.snapshot_id = id;
        toast(id);
        this.leave();
    }

    get_snapshot_id(): string {
        return `盤${this.snapshots.length + 1}`;
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

    hover_on_piece(piece: JQuery) {
        if (this.analysis_mode && !this.edit_mode && !this.locked && piece.hasClass("to-play")) {
            this.highlight_droppable_cells(piece);
            this.highlight_best_move_piece();
            this.pv_hover_move = get_hover_pv_move(this, piece);
            this.update_principal_variation_display();
        }
    }

    dragstart(piece: JQuery) {
        if (this.edit_mode) {
            this.edit_controller.dragstart(piece);
            return;
        }
        this.highlight_droppable_cells(piece);
        if (this.analysis_mode && !this.locked && piece.hasClass("to-play")) {
            this.pv_drag_piece = piece;
            this.highlight_best_move_piece();
            this.update_drag_pv_piece(piece);
        }
    }

    highlight_droppable_cells(piece: JQuery) {
        const is_master_turn = this.is_white_turn();
        const turn = is_master_turn ? "master" : "player";
        if (!piece.hasClass(turn)) return;
        if (this.ui_state.board.gameover_status() !== 0) return;
        // show droppable cells
        this.query_move(piece, {}, (move) => {
            let cell = this.get_cell(move.nx, move.ny);
            cell.droppable("enable");
            cell.addClass("possible");
            if (!this.analysis_mode) return;
            let r_nb = this.revflip_maybe(move.new_board, is_master_turn);
            let depth = this.ai.search_depth(r_nb);
            let status = r_nb.gameover_status();
            const depth_text =
                  !this.analysis_mode ? "" :
                  status > 0 ? "!" : // win
                  status < 0 || depth === 1 ? "x" :  // lose
                  depth < 0 ? "-" :  // draw
                  depth + 1;
            // (note) check gameover_status in depth_text because losing
            // positions can have depth = 0 in special cases:
            // +B4C3LI
            // -B1A2LI
            // +C3C2LI
            // -A2A3LI
            // +C2B1LI
            // > ui.ui_state.board.toString()
            // gLe 
            // .c.
            // lC.
            // E.G 
            // next move "-A1A2KI" causes "depth = 0" (immediate "try")
            // .Le 
            // gc.
            // lC.
            // E.G 
            cell.children().first().text(depth_text);
            const set_c = (klass: string, flag: boolean) =>
                  cell.toggleClass(klass, this.analysis_mode && flag);
            set_c("winning", depth % 2 === 0 && status >= 0);
            set_c("draw", depth < 0);
            const best_p = this.ui_state.depth === 1 ? status > 0 :
                  depth + (depth < 0 ? 0 : 1) === this.ui_state.depth;
            set_c("best", best_p);
        });
    }

    dragstop(piece?: JQuery) {
        // make all cells undroppable
        this.hide_hints();
        this.pv_drag_piece = null;
        this.update_principal_variation_display();
        $("div.cell, div.hand").droppable("disable");
        if (this.edit_mode && piece) {
            const place = piece.parent();
            piece.css("fontSize", place.hasClass("hand") ? "0.5em" : "1em");
        }
    }

    hide_hints() {
        $(".piece").removeClass("best-move");
        $("div.cell, div.hand").removeClass("possible drop-current winning draw best");
        $("span.hint").text("");
        this.pv_hover_move = null;
    }

    update_drag_pv(piece: JQuery, target: JQuery<HTMLElement>) {
        if (!this.analysis_mode || this.edit_mode || !piece.hasClass("to-play")) return;
        if (!target.hasClass("cell")) return;
        const [nx, ny] = this.get_position_from_cell(target);
        const moves: Move[] = [];
        this.query_move(piece, {nx, ny}, (move) => moves.push(move));
        this.pv_hover_move = moves[0] || null;
        this.update_principal_variation_display();
    }

    update_drag_pv_piece(piece: JQuery) {
        if (!this.analysis_mode || this.edit_mode || !piece.hasClass("to-play")) return;
        this.pv_hover_move = get_hover_pv_move(this, piece);
        this.update_principal_variation_display();
    }

    clear_drag_p(piece: JQuery) {
        if (!this.analysis_mode || this.edit_mode || !piece.hasClass("to-play")) return;
        if (this.pv_drag_piece && this.pv_drag_piece.length > 0) {
            this.update_drag_pv_piece(this.pv_drag_piece);
            return;
        }
        this.pv_hover_move = null;
        this.update_principal_variation_display();
    }

    drop(piece: JQuery, new_cell: JQuery, e: JQueryEventObject) { // mouse drop
        if (this.edit_mode) {
            this.edit_controller.drop(piece, new_cell, e);
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

    play_best_move() {
        const [_, best_moves] = this.get_depth_and_best_moves();
        const move = random_choice(best_moves);
        move && this.do_turn(move);
    }

    // execute the player's turn, decide and execute the master's turn
    do_turn(move: Move, piece: JQuery | undefined = undefined) {
        if (!this.enter()) return;
        let next_white_p = piece ? piece.hasClass("player") : !this.is_white_turn();
        let nb = move.new_board;
        let gameover = nb.gameover_status();
        let [depth, nmoves] = (gameover === 0) ?
            this.get_depth_and_best_moves(nb, next_white_p) : [-1, []];
        let nmove = random_choice(nmoves) || null;
        this.clear_future(true);
        this.history.push([this.ui_state, move, depth]);

        // state & history must be updated before do_move
        const state_before_nmove = { board: nb, depth: depth };
        this.ui_state = state_before_nmove;
        this.do_move(move, piece);
        if (!nmove || this.analysis_mode || !this.is_white_turn()) return this.leave();
        this.update_ui();
        this.update_records();
        $("span.piece").delay(300).promise().done(() => {
            // state & history must be updated before do_move
            let depth_after_nmove = Math.max(-1, depth - 1);
            let state_after_nmove = { board: nmove.new_board, depth: depth_after_nmove };
            this.history.push([state_before_nmove, nmove, depth_after_nmove]);
            this.ui_state = state_after_nmove;
            this.do_move(nmove);
            this.leave();
        });
    }

    do_master_turn_leave(delay_millisec = 300) {
        const proc = this.master_turn_proc();
        $("span.piece").delay(delay_millisec).promise().done(() => (proc(), this.leave()));
    }

    do_master_turn_now() {
        this.master_turn_proc()();
    }

    master_turn_proc(): () => void {
        let [depth, nmoves] = this.get_depth_and_best_moves();
        let nmove = random_choice(nmoves);
        if (depth === null || nmoves.length === 0 || !nmove) return () => {};
        const depth_after_nmove = Math.max(-1, depth - 1);
        return () => {
            // state & history must be updated before do_move
            this.clear_future(true);
            this.history.push([this.ui_state, nmove, depth_after_nmove]);
            this.ui_state = { board: nmove.new_board, depth: depth_after_nmove};
            this.do_move(nmove);
        }
    }

    get_depth_and_best_moves(board = this.ui_state.board, white_p = this.is_white_turn()): [number, Move[]] {
        const rev = !white_p;
        const white_board = this.revflip_maybe(board, rev);
        const [depth, nbs] = this.ai.search(white_board);
        const white_moves = nbs.map(nb => Move.detect_move(white_board, nb));
        return [depth, white_moves.map(m => this.revflip_maybe(m, rev))];
    }

    update_principal_variation_display() {
        const pv_p = this.analysis_mode;
        const pv_text = pv_p ?
              format_principal_variation(this, this.ui_state.board, this.is_white_turn(), this.pv_hover_move) :
              "";
        $("#pv").stop(true, true);
        pv_p ? $("#pv").slideDown(100) : $("#pv").slideUp(100);
        $("#pv #pv-text").html(pv_text);
    }

    highlight_best_move_piece() {
        const [_, moves] = this.get_depth_and_best_moves();
        moves.forEach(move => {
            const [place, piece] = (move instanceof Normal) ?
                  this.get_cell_piece(move.x, move.y) : this.get_hand_piece(move.p);
            piece.addClass("best-move");
        });
    }

    undo_turn() {
        if (!this.enter()) return;
        this.undo_turn_leave();
    }

    undo_turn_leave(callback?: (s: UIState) => void) {
        let prev = this.history.pop();
        if (!prev) return this.leave();
        this.future.push(prev);
        let [prev_state, move] = prev;
        if (!move) return this.leave();
        $("span.piece").promise().done(() => {
            this.undo_move(move);
            callback ? callback(prev_state) : this.leave(prev_state);
        });
    }

    // revoke the previous two turns (master's and player's)
    matta() {
        if (!this.enter()) return;
        const callback = (s: UIState) => {
            this.ui_state = s;
            if (this.history.length > 0)
                this.undo_turn_leave();
            else if (this.is_white_turn())
                this.do_master_turn_leave();
            else
                this.leave();
        }
        this.undo_turn_leave(callback);
    }

    redo_turn() {
        if (!this.enter()) return;
        this.redo_turn_leave();
    }

    redo_turn_leave() {
        let next = this.future.pop();
        if (!next) return this.leave();
        this.history.push(next);
        let [_cur_state, move, depth] = next;
        if (!move) return this.leave();
        $("span.piece").promise().done(() => {
            this.do_move_sub(move, undefined, true);
            this.ui_state = { board: move.new_board, depth };
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
        $("span#msg").addClass("obsolete");
        $("span.piece").draggable("disable");
        $("#dead-msg").hide();
        $("#won-msg").hide();
        $("span#master").addClass("thinking");
        $("#depth-ckbox").prop("disabled", true);
        return true;
    }

    // stop changing the state
    leave(s: UIState | undefined = undefined) {
        if (s) this.ui_state = s;
        this.update_ui();
        this.update_records();
        this.locked = false;
    }

    update_ui() {
        if (this.ui_state.depth === null) this.update_depth();
        let d = this.ui_state.depth as number;
        const gameover = this.ui_state.board.gameover_status();
        const hide_depth_p = !this.analysis_mode;
        $("span#player").removeClass();
        if (this.edit_mode) $("span#player").addClass("draw");
        else if (gameover > 0) $("span#player").addClass("win");
        else if (gameover < 0) $("span#player").addClass("level6");
        else if (d < 0 || hide_depth_p) $("span#player").addClass("draw");
        else if (d % 2 !== 0) $("span#player").addClass("level1");
        else if (d >= 70) $("span#player").addClass("level1");
        else if (d >= 40) $("span#player").addClass("level2");
        else if (d >= 20) $("span#player").addClass("level3");
        else if (d >= 10) $("span#player").addClass("level4");
        else if (d >=  2) $("span#player").addClass("level5");
        else if (d === 0) $("span#player").addClass("level6");
        const msg = [
            "トライ", "キャッチ",
            null,
            "キャッチ！", "トライ！",
        ][gameover + 2];
        $("span#msg").toggleClass("isGameover", gameover !== 0);
        if (msg) {
            $("span#msg #gameover").text(msg);
            if (gameover * (this.swap_side_p ? -1 : 1) > 0) {
                $("#won-msg").show();
                $("span#about-image").removeClass("dead");
            } else {
                $("#dead-msg").show();
                $("span#about-image").addClass("dead");
            }
            $("span#last").text($("#record").children().length);
        }
        else {
            $("span#msg #revealed-depth").text(d >= 0 ? d : "---");
            if (d <= 10) $("#player").addClass("dying");
            $("span#about-image").removeClass("dead");
        }
        $("span#msg").removeClass("obsolete").toggleClass("censored", hide_depth_p);
        const title_text = this.swap_side_p ?
              "（後手から見た盤面）" : "どうぶつしょうぎ名人'";
        $("span#title-text").text(title_text);
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
        const master_to_play = this.is_white_turn();
        $(".player").toggleClass("to-play", gameover === 0 && !master_to_play);
        $(".master").toggleClass("to-play", gameover === 0 && master_to_play);
        $("span#player").toggleClass("opposite", !this.edit_mode && gameover === 0 && master_to_play);
        if (this.edit_mode) {
            $("#record-box").children().hide();
            $("#record-controls").show();
            $("#record-controls").children().hide();
            $(".edit-mode-only, .edit-mode-too").show();
            $("button").prop("disabled", true);
            $(".edit-mode-only, #piece-menu button").prop("disabled", false);
            $(".player, .master").toggleClass("to-play", true);
        } else {
            $("#record-box > *:not(#pv)").show();  // exclude #pv for animation
            $("#record-controls").children().show();
            $("#record-controls .edit-mode-only").hide();
            $("button").prop("disabled", false);
            $("button#matta").prop("disabled", this.history.length === 0);
            $("button#undo").prop("disabled", this.history.length === 0);
            $("button#redo").prop("disabled", this.future.length === 0);
            $("button#prev-board").prop("disabled", this.snapshots.length === 0);
            $("button#next-board").prop("disabled", this.snapshots.length === 0);
            $("button#best-move").prop("disabled", gameover !== 0);
            $("button#puzzle").toggle(this.puzzle_depth > 0);
            $("button#reveal-eval").css("visibility", this.analysis_mode ? "hidden" : "visible");
        }
        $("button#autorun").prop("disabled", gameover !== 0);
        $("button#copy, button#download").prop("disabled", this.fresh_game_p(Board.init()));
        $("#depth-ckbox").prop("disabled", false);
        $("#move-count").text(this.history.length);
        $("#board-hashstr").text(this.board_hashstr());
        $("#board-normalized-hashstr").text(this.board_hashstr(true));
        $("#analysis-ckbox").prop("checked", this.analysis_mode);
        $("#swap-ckbox").prop("checked", this.swap_side_p);
        this.update_principal_variation_display();
        this.update_coord_labels();
        const hl = this.history.length
        const v = hl === 0 ? $("li#record-before-first") : $("ol#record").children().eq(hl - 1);
        v.length > 0 && $("#container").css("flex-direction") === "row" &&
            v[0].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    board_hashstr(normalize_p = false): string {
        const b = this.revflip_maybe(this.ui_state.board, this.is_white_turn());
        return (normalize_p ? b.normalize() : b).hashstr();
    }

    update_coord_labels() {
        const row = ["1", "2", "3", "4"];
        const col = ["A", "B", "C"];
        if (this.swap_side_p) {
            row.reverse();
            col.reverse();
        }
        $("td.row-label").each((i, elem) => { $(elem).text(row[i]); });
        $("td.col-label").each((i, elem) => { $(elem).text(col[i]); });
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

    add_to_record(move: Move, prev_li?: JQuery<HTMLElement> | null): JQuery<HTMLElement> {
        // add a entry to the record
        if (!prev_li)
            prev_li = $("ol#record").children().last();
        let s1 = this.revflip_maybe(move, this.swap_side_p).toString();
        let s2 = prev_li.data("full-text") || "";
        let s = s1;
        if (s1.substring(1, 3) === s2.substring(1, 3))
            s = s1[0] + "同" + s1.substr(3);
        const dp = $("<div>").addClass("depth");
        const mv = $("<div>").addClass("move").text(s);
        const li = $("<li>").append(dp).append(mv).data("full-text", s1);
        $("ol#record").append(li);
        return li;
    }

    do_move_sub(move: Move, piece: JQuery | undefined = undefined, fast = false) {
        this.hide_hints();
        let new_cell = this.get_cell(move.nx, move.ny);
        if (move instanceof Normal) {
            if (move.captured_piece() !== Piece.Empty) {
                // move a captured piece into hand
                let [new_cell, piece] = this.get_cell_piece(move.nx, move.ny);
                let hand = this.get_empty_hand(piece.hasClass("master"));
                this.animate_piece(piece, new_cell, hand, fast);

                // a captured piece becomes the opponent's, promotion is revoked
                piece.toggleClass("master");
                piece.toggleClass("player");
                piece.removeClass("promoted");
            }

            // move a piece
            let [old_cell, piece] = this.get_cell_piece(move.x, move.y);
            if (move.promotion_p()) piece.addClass("promoted");
            this.animate_piece(piece, old_cell, new_cell, fast);
        }
        else {
            // drop a piece
            let [hand, piece_] = piece ? [piece.parent(), piece] : this.get_hand_piece(move.p);
            this.animate_piece(piece_, hand, new_cell, fast);
        }
    }

    // perform a move backward
    undo_move(move: Move) {
        this.hide_hints();
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
    }

    update_records(force = false) {
        if (this.history.length + this.future.length > 10000) {
            $("li#record-before-first").css("border-left-color", "transparent");
            return;
        }
        const mc = this.history.length;
        const records = $("ol#record").children();
        records.slice(0, mc).removeClass("future-move");
        records.slice(mc).addClass("future-move");
        const hs = [...this.history, ...this.future.toReversed()];
        const max_depth = Math.max(this.ui_state.depth || 0, hs[0]?.[0].depth || 0, ...hs.map(h => h[2] || 0));
        if (this.analysis_mode || force) {
            this.update_record_item(-1, $("li#record-before-first")[0], max_depth, hs);
            $("ol#record").children()
                .each((i, elem) => this.update_record_item(i, elem, max_depth, hs));
        } else {
            const lis = $("li#record-before-first, ol#record li");
            lis.css("border-left-color", "transparent");
            lis.children(".outcome-loss, .moves-loss").parent().removeAttr("title").tooltip("destroy");
            lis.children(".move").removeClass("outcome-loss moves-loss")
        }
    }

    update_record_item(i: number, elem: HTMLElement, max_depth: number, hs: UIHistoryItem[]) {
        let [{depth}, move, next_depth] = hs[i] || hs[0] || [this.ui_state, null, -1];
        if (i < 0)
            next_depth = depth;
        if (next_depth === null) return;
        // util
        const biggest = 7777777;
        const is_big = (x: number): boolean => x > biggest * 0.5;
        const parity_sign = (k: number): number => k % 2 === 0 ? +1 : -1;
        const linearlize = (d: number | null, game_over_status: number): number =>
              (game_over_status !== 0) ? Math.sign(game_over_status) * biggest :
              (d === null || d < 0) ? 0 : parity_sign(d) * (biggest - d);
        const trans = (x: number, [a0, b0]: number[], [a1, b1]: number[]): number =>
              a1 + (x - a0) / (b0 - a0) * (b1 - a1);  // map [a0, b0] to [a1, b1]
        // viewpoints:
        // b_ = from the bottom player whose side is displayed in bottom
        // f_ = from the first player who played the first move in the game
        // m_ = from the move player who played this move
        // conversion:
        // b_ <=(swap_sign)=> f_ <=(player_sign)=> m_
        // keep "positive = win" to avoid confusion.
        const player_sign = parity_sign(i);
        const swap_sign = this.swap_side_p ? -1 : +1;
        const b_next_gos = move === null ? 0 : move.new_board.gameover_status();
        const m_next_gos = b_next_gos * swap_sign * player_sign;
        const m_eval = - linearlize(depth, 0);  // even depth = lose
        const m_next_eval = linearlize(next_depth, m_next_gos);
        const b_next_eval = m_next_eval * player_sign * swap_sign;
        // [depth bar]
        const min_l = 0.0;
        const max_l = 0.4;
        const l = Math.min(max_l, trans(next_depth, [0, max_depth + 1e-5], [min_l, max_l]));
        const color_level = (b_next_eval === 0) ? 0.5 : (b_next_eval > 0) ? l : 1 - l;
        const li = $(elem);
        li.css("border-left-color", get_color(color_level));
        // [bad move mark]
        const mv = li.children(".move");
        if (mv.length === 0 || depth === null) return;
        const m_optimal_next_eval = m_eval + Math.sign(m_eval);
        const m_regret = m_optimal_next_eval - m_next_eval;
        const m_big_regret_p = is_big(m_regret);
        mv.toggleClass("outcome-loss", m_big_regret_p)
            .toggleClass("moves-loss", !m_big_regret_p && m_regret > 0);
        // [tooltip]
        if (m_regret === 0) return;
        const m_outcome = (d: number, ev: number, gos: number): string => [
            "負",
            [`${d}手負`, " - ", `${d}手勝`][Math.sign(ev) + 1],
            "勝",
        ][Math.sign(gos) + 1];
        const m_o = m_outcome(depth, m_eval, 0);
        const m_next_o = m_outcome(next_depth + 1, m_next_eval, m_next_gos);
        const tooltip = `${m_o} → ${m_next_o}`;
        li.attr("title", tooltip).tooltip({
            show: 100, hide: 100,
            position: {
                my: "left top",
                at: "left+50 bottom+50",
                collision: "flipfit"
            },
        });
    }
}

function toast(message: string, millisec = 2000) {
    $("#toast-message").text(message);
    $("#toast").stop(true, true).fadeTo(0, 1).fadeTo(millisec, 0);
}

function random_choice<T>(arr: readonly T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

// テストしたい手順
//   にわとりになる
//   トライで負ける
//   にわとり取られる
//   持ち駒が 6 個になる
