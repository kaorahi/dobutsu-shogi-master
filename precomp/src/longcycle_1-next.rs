// List draw boards and their subsequent boards that are also draws.
//
// Input: 2-analyze's output
//
// Output:
//   board next_board ... next_board
//   ...
//
//   board: hex representation of bit-board
//   next_board: ditto.

#[macro_use]
extern crate precomp;

use std::io::{self, BufRead};

use precomp::{Out};
use precomp::board::{Board, Result};
use precomp::board_collection::BoardSet;
use precomp::rules::init_rules_from_cli;

fn main() -> std::io::Result<()> {
    log!("LongCycle Step 1: list next boards");

    init_rules_from_cli();

    let mut draw_boards: BoardSet = BoardSet::new();

    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = line.unwrap();
        let split: Vec<&str> = line.as_str().split(' ').collect();
        let b = Board(u64::from_str_radix(split[0], 16).unwrap());
        let depth = i32::from_str_radix(split[1], 10).unwrap();
        if depth == -1 {
            draw_boards.insert(b);
        }
    }

    let mut out = Out::new();
    draw_boards.each(|b| {
        out!(out, "{:015x}", b.0);
        if let Result::Unknown(bs) = b.next() {
            for nb in bs {
                if draw_boards.contains(nb) {
                    out!(out, " {:015x}", nb.0);
                }
            }
        }
        out!(out, "\n");
    });

    Ok(())
}
