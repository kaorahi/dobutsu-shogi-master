import {Board, Piece} from "./board";
import type {UI} from "./ui";

export class EditModeController {
    context_menu_piece: JQuery | null = null;
    pre_edit_state: UI["ui_state"] | null = null;

    constructor(private host: UI) {}

    enterEditMode() {
        if (!this.host.enter()) return;
        this.pre_edit_state = this.host.ui_state;
        this.host.edit_mode = true;
        this.host.leave();
    }

    confirmEditMode() {
        if (!this.host.enter()) return;
        this.closeContextMenu();
        this.host.edit_mode = false;
        // restore board before set_board() for snapshot in it
        this.pre_edit_state && (this.host.ui_state = this.pre_edit_state);
        this.host.set_board(this.buildBoardFromDom(), false, true);
        this.host.leave();
    }

    dragstart(piece: JQuery) {
        this.closeContextMenu();
        piece.css("fontSize", "0.5em");
        $("div.cell").droppable("enable");
        $("div.cell").addClass("possible");
        $("div.hand").droppable("enable");
        $("div.hand").addClass("possible");
        const from_hand = piece.parent().hasClass("hand");
        if (from_hand) {
            $("div.cell, div.hand").filter((_, elem) => {
                const cell = $(elem);
                const occupant = cell.children("span.piece").last();
                return occupant.length > 0 && this.host.get_piece_id_from_piece(occupant) === Piece.Lion;
            }).each((_, elem) => {
                $(elem).droppable("disable");
                $(elem).removeClass("possible");
            });
        }
        if (this.host.get_piece_id_from_piece(piece) === Piece.Lion) {
            $("div.hand").droppable("disable");
            $("div.hand").removeClass("possible");
        }
    }

    drop(piece: JQuery, new_place: JQuery, e: JQueryEventObject) {
        if (!this.host.enter()) return;
        this.openContextMenu(piece, new_place, e);
        if (new_place.hasClass("hand") && this.host.get_piece_id_from_piece(piece) === Piece.Lion)
            return this.host.leave();
        const old_place = piece.parent();
        if (old_place.is(new_place)) {
            this.normalizePieceForPlace(piece, new_place);
            piece.css({ left: 0, top: 0, fontSize: new_place.hasClass("hand") ? "0.5em" : "1em" });
            this.syncBoardFromDom();
            return this.host.leave();
        }

        const target_piece = new_place.children("span.piece").first();
        if (target_piece.length > 0) {
            old_place.append(target_piece);
            this.normalizePieceForPlace(target_piece, old_place);
            target_piece.css({ left: 0, top: 0, fontSize: old_place.hasClass("hand") ? "0.5em" : "1em" });
            if (new_place.hasClass("hand") && this.host.get_piece_id_from_piece(target_piece) === Piece.Lion)
                target_piece.toggleClass("master").toggleClass("player");
        }

        new_place.append(piece);
        this.normalizePieceForPlace(piece, new_place);
        piece.css({ left: 0, top: 0, fontSize: new_place.hasClass("hand") ? "0.5em" : "1em" });
        if (old_place.hasClass("hand") && this.host.get_piece_id_from_piece(piece) === Piece.Lion)
            piece.toggleClass("master").toggleClass("player");
        this.syncBoardFromDom();
        this.host.leave();
    }

    revflipBoard() {
        this.transformBoard((board) => board.revflip());
    }

    flipBoard() {
        this.transformBoard((board) => board.flip());
    }

    highlightDropTarget(place: JQuery) {
        this.clearDropTarget();
        if (this.host.edit_mode)
            place.addClass("drop-current");
    }

    clearDropTarget(place?: JQuery) {
        if (place)
            place.removeClass("drop-current");
        else
            $("div.cell, div.hand").removeClass("drop-current");
    }

    openContextMenu(piece: JQuery, new_place: JQuery, e: JQueryEventObject) {
        if (!this.host.edit_mode || new_place.hasClass("hand")) return;
        this.closeContextMenu();
        const kind = this.host.get_piece_id_from_piece(piece);
        if (kind === Piece.Lion) return;
        this.context_menu_piece = piece;
        const menu = $("#piece-menu");
        menu.find("[data-action=player]").toggle(!piece.hasClass("player"));
        menu.find("[data-action=master]").toggle(!piece.hasClass("master"));
        menu.find("[data-action=promote]").toggle(kind === Piece.Chick);
        menu.find("[data-action=unpromote]").toggle(kind === Piece.Hen);
        menu.css("left", `${e.pageX}px`);
        menu.css("top", `${e.pageY}px`);
        menu.show();
    }

    closeContextMenu() {
        this.context_menu_piece = null;
        $("#piece-menu").hide();
    }

    applyContextMenuAction(action: string) {
        if (!this.host.enter()) return;
        const piece = this.context_menu_piece;
        if (!piece || piece.length === 0) return this.host.leave();
        switch (action) {
        case "player":
            piece.removeClass("master").addClass("player");
            break;
        case "master":
            piece.removeClass("player").addClass("master");
            break;
        case "promote":
            if (!piece.parent().hasClass("hand") && this.host.get_piece_id_from_piece(piece) === Piece.Chick)
                piece.addClass("promoted");
            break;
        case "unpromote":
            piece.removeClass("promoted");
            break;
        }
        this.closeContextMenu();
        this.syncBoardFromDom();
        this.host.leave();
    }

    private normalizePieceForPlace(piece: JQuery, place: JQuery) {
        if (!place.hasClass("hand")) return;
        piece.removeClass("promoted");
        const player_p = String(place.attr("id")).startsWith("player");
        piece.toggleClass("player", player_p);
        piece.toggleClass("master", !player_p);
    }

    private syncBoardFromDom() {
        this.host.ui_state = { board: this.buildBoardFromDom(), depth: null };
        this.host.update_depth();
    }

    private transformBoard(transform: (board: Board) => Board) {
        if (!this.host.edit_mode) return;
        if (!this.host.enter()) return;
        this.closeContextMenu();
        const board = transform(this.buildBoardFromDom());
        this.host.set_board(board, true);
        this.host.leave();
    }

    private buildBoardFromDom(): Board {
        let board = new Board(0, 0);
        $("span.piece").each((_, elem) => {
            const piece = $(elem);
            const place = piece.parent();
            const kind = this.host.get_piece_id_from_piece(piece);
            if (place.hasClass("cell")) {
                const [x, y] = this.host.get_position_from_cell(place);
                const p = piece.hasClass("master") ? Piece.opponent[kind] : kind;
                board = board.put(x, y, p);
            } else if (kind === Piece.Lion) {
                // skip
            } else if (piece.hasClass("player")) {
                board = board.inc_hand(kind);
            } else {
                board = board.revflip().inc_hand(kind).revflip();
            }
        });
        return board;
    }
}
