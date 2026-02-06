use std::ptr;
use std::sync::atomic::{AtomicPtr, Ordering};

use crate::board::Move;

pub struct Rules {
    pub lion: Vec<Move>,
    pub elephant: Vec<Move>,
    pub giraffe: Vec<Move>,
    pub chick: Vec<Move>,
    pub hen: Vec<Move>,
    pub try_p: bool,
}

static RULES_PTR: AtomicPtr<Rules> = AtomicPtr::new(ptr::null_mut());

fn set_rules(r: Rules) {
    let p = Box::into_raw(Box::new(r));
    let prev = RULES_PTR.compare_exchange(
        ptr::null_mut(),
        p,
        Ordering::SeqCst,
        Ordering::SeqCst,
    );
    if prev.is_err() {
        unsafe { drop(Box::from_raw(p)); }
        panic!("Rules already initialized");
    }
}

pub fn rules() -> &'static Rules {
    let p = RULES_PTR.load(Ordering::SeqCst);
    if p.is_null() {
        panic!("Rules not initialized");
    }
    unsafe { &*p }
}

fn digit32(c: char) -> Result<u8, String> {
    match c {
        '0'..='9' => Ok((c as u8) - b'0'),
        'A'..='V' => Ok((c as u8) - b'A' + 10),
        'a'..='v' => Ok((c as u8) - b'a' + 10),
        _ => Err(format!("invalid base32 digit: {}", c)),
    }
}

// bit order: N U H D S
fn decode_moves(v: u8) -> Vec<Move> {
    fn m(dx: i8, dy: i8) -> Move { Move::new(dx, dy) }

    let mut out = Vec::new();

    let mut nw = false;
    let mut n = false;
    let mut ne = false;
    let mut w = false;
    let mut e = false;
    let mut sw = false;
    let mut s = false;
    let mut se = false;

    if (v & (1 << 0)) != 0 { n = true; }             // N
    if (v & (1 << 1)) != 0 { nw = true; ne = true; } // U
    if (v & (1 << 2)) != 0 { w = true;  e = true; }  // H
    if (v & (1 << 3)) != 0 { sw = true; se = true; } // D
    if (v & (1 << 4)) != 0 { s = true; }             // S

    // keep this order for backward compatibility
    if nw { out.push(m(-1,  1)); }
    if n  { out.push(m( 0,  1)); }
    if ne { out.push(m( 1,  1)); }
    if w  { out.push(m(-1,  0)); }
    if e  { out.push(m( 1,  0)); }
    if sw { out.push(m(-1, -1)); }
    if s  { out.push(m( 0, -1)); }
    if se { out.push(m( 1, -1)); }

    out
}

fn parse_rules(s: &str) -> Result<Rules, String> {
    let (core, try_p) = if let Some(stripped) = s.strip_suffix('T') {
        (stripped, false)
    } else {
        (s, true)
    };
    let cs: Vec<char> = core.chars().collect();
    if cs.len() != 5 {
        return Err("rules must be 5 chars: L E G C H".to_string());
    }

    Ok(Rules {
        lion: decode_moves(digit32(cs[0])?),
        elephant: decode_moves(digit32(cs[1])?),
        giraffe: decode_moves(digit32(cs[2])?),
        chick: decode_moves(digit32(cs[3])?),
        hen: decode_moves(digit32(cs[4])?),
        try_p: try_p,
    })
}

fn find_rules_arg() -> Option<String> {
    for a in std::env::args() {
        if a.starts_with("--rules=") {
            return Some(a["--rules=".len()..].to_string());
        }
    }
    None
}

pub fn init_rules_from_cli() {
    let default_rules = "val1n"; // lion, elephant, giraffe, chick, hen
    let s = find_rules_arg().unwrap_or_else(|| default_rules.to_string());
    let r = parse_rules(&s).unwrap_or_else(|e| panic!("{}", e));
    set_rules(r);
}
