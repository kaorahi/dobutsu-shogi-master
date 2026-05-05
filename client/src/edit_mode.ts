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
        this.normalizePieceGeometry(piece, true);  // avoid overflow
        $("div.cell").addClass("possible").droppable("enable");
        $("div.hand").addClass("possible").droppable("enable");
        if (this.host.get_piece_id_from_piece(piece) === Piece.Lion) {
            $("div.hand").removeClass("possible").droppable("disable");
        }
        if (piece.parent().hasClass("hand")) {
            $("div.cell, div.hand").each((_, elem) => {
                const cell = $(elem);
                const occupant = cell.children("span.piece").last();
                const inhibited = occupant.length > 0 &&
                      this.host.get_piece_id_from_piece(occupant) === Piece.Lion;
                if (inhibited)
                    cell.removeClass("possible").droppable("disable");
            });
        }
    }

    drop(piece: JQuery, new_place: JQuery, e: JQueryEventObject) {
        if (!this.host.enter()) return;
        const occupant = new_place.children("span.piece").last();
        if (occupant.length > 0)
            this.movePiece(occupant, piece.parent());
        this.movePiece(piece, new_place);
        this.syncBoardFromDom();
        if (new_place.hasClass("cell"))
            this.openContextMenu(piece, e);
        this.host.leave();
    }

    revflipBoard() {
        this.transformBoard((board) => board.revflip());
    }

    flipBoard() {
        this.transformBoard((board) => board.flip());
    }

    openContextMenu(piece: JQuery, e: JQueryEventObject) {
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

    private movePiece(piece: JQuery, new_place: JQuery) {
        const isLionRevived = piece.parent().hasClass("hand") &&
              new_place.hasClass("cell") &&
              this.host.get_piece_id_from_piece(piece) === Piece.Lion;
        if (isLionRevived)
            piece.toggleClass("master").toggleClass("player");
        new_place.append(piece);
        this.normalizePieceForPlace(piece, new_place);
    }

    private normalizePieceForPlace(piece: JQuery, place: JQuery) {
        const isHand = place.hasClass("hand");
        this.normalizePieceGeometry(piece, isHand);
        if (isHand) {
            piece.removeClass("promoted");
            const player_p = String(place.attr("id")).startsWith("player");
            piece.toggleClass("player", player_p);
            piece.toggleClass("master", !player_p);
        }
    }

    private normalizePieceGeometry(piece: JQuery, isHand: boolean) {
        piece.css({ left: 0, top: 0, fontSize: isHand ? "0.5em" : "1em" });
    }

    private syncBoardFromDom() {
        this.host.ui_state = { board: this.buildBoardFromDom(), depth: null };
    }

    private transformBoard(transform: (board: Board) => Board) {
        if (!this.host.enter()) return;
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
