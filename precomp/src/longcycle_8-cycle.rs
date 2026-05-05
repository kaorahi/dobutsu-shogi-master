extern crate rand;

use rand::prelude::*;
use rand::rngs::StdRng;
use rand::RngCore;
use std::collections::HashMap;
use std::io::{self, Read};
use std::thread;
use std::time::Duration;

type Graph = HashMap<String, Vec<String>>;

fn load_graph() -> Graph {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();

    let mut g: Graph = HashMap::new();
    for line in input.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let key = parts[0].to_string();
            let vals = parts[1..].iter().map(|s| s.to_string()).collect::<Vec<_>>();
            g.insert(key, vals);
        }
    }
    g
}

type Pred = HashMap<String, Vec<String>>;

fn build_pred(g: &Graph) -> Pred {
    let mut pred: Pred = HashMap::new();
    for (u, vs) in g {
        for v in vs {
            pred.entry(v.clone()).or_insert_with(Vec::new).push(u.clone());
        }
    }
    pred
}

type Gp2p = HashMap<String, String>;

fn build_gp2p(pred: &Pred, start: &str) -> Gp2p {
    let mut gp2p: Gp2p = HashMap::new();
    let parents = pred.get(start).cloned().unwrap_or_default();
    for p in parents {
        let gps = pred.get(&p).cloned().unwrap_or_default();
        for gp in gps {
            gp2p.entry(gp).or_insert_with(|| p.clone());
        }
    }
    gp2p
}

#[derive(Clone)]
struct Frame {
    neigh: Vec<String>,
    i: usize,
}

// Returns (champ_len, champ_path_including_closing_node)
fn find_cycle_from_start(
    g: &Graph,
    start: &str,
    gp2p: &Gp2p,
    seed: u64,
    t: u64,
    tries: u64,
    first_max_steps: u64,
    final_max_steps: u64,
    promising_max_steps: u64,
    promising_len: usize,
) -> (u64, usize, Vec<String>) {
    let mut rng: StdRng = StdRng::seed_from_u64(seed);

    let mut path: Vec<String> = vec![start.to_string()];
    let mut pos: HashMap<String, usize> = HashMap::new();
    pos.insert(start.to_string(), 0);

    let mut champ_len: usize = 0;
    let mut max_steps: u64 = first_max_steps;
    let mut ret: (u64, usize, Vec<String>) = (0, 0, Vec::new());

    let mut neigh0 = g.get(start).cloned().unwrap_or_default();
    neigh0.shuffle(&mut rng);

    let mut stack: Vec<Frame> = Vec::new();
    stack.push(Frame {
        neigh: neigh0,
        i: 0,
    });

    let mut steps: u64 = 0;
    while !stack.is_empty() && steps < max_steps {
        steps += 1;

        let top_i = stack.len() - 1;
        let done = stack[top_i].i >= stack[top_i].neigh.len();
        if done {
            stack.pop();

            if path.len() > 1 {
                if let Some(popped) = path.pop() {
                    pos.remove(&popped);
                }
            }

            if let Some(prev) = stack.last_mut() {
                prev.i += 1;
            }
            continue;
        }

        let nxt = stack[top_i].neigh[stack[top_i].i].clone();
        stack[top_i].i += 1;

        if let Some(_) = pos.get(&nxt) {
        // if let Some(&j) = pos.get(&nxt) {
            // let cycle_len = path.len() - j;
            // if j == 0 && cycle_len > champ_len && (cycle_len % 2 == 1) {
            //     eprintln!(
            //         "try={}/{} Seed={} len={} (steps={}/{})",
            //         t + 1, tries, seed, cycle_len, steps, max_steps
            //     );
            //     champ_len = cycle_len;

            //     let mut champ = path.clone();
            //     champ.push(nxt.clone());
            //     ret = (steps, champ_len, champ);

            //     let proposed = steps.saturating_mul(2);
            //     let grown = if max_steps > proposed { max_steps } else { proposed };
            //     let lim = if champ_len >= promising_len { promising_max_steps } else {final_max_steps};
            //     max_steps = std::cmp::min(grown, lim);
            // }
            continue;
        }

        pos.insert(nxt.clone(), path.len());
        path.push(nxt.clone());

        if let Some(p) = gp2p.get(&nxt) {
            if !pos.contains_key(p) {
                let cycle_len = (path.len() - 1) + 2;
                if cycle_len > champ_len && (cycle_len % 2 == 1) {
                    eprintln!(
                        "try={}/{} Seed={} len={} via_gp (steps={}/{})",
                        t + 1, tries, seed, cycle_len, steps, max_steps
                    );
                    champ_len = cycle_len;

                    let mut champ = path.clone();
                    champ.push(p.clone());
                    champ.push(start.to_string());
                    ret = (steps, champ_len, champ);

                    let proposed = steps.saturating_mul(2);
                    let grown = if max_steps > proposed { max_steps } else { proposed };
                    let lim = if champ_len >= promising_len { promising_max_steps } else {final_max_steps};
                    max_steps = std::cmp::min(grown, lim);
                }
            }
        }

        let mut nlist = g.get(&nxt).cloned().unwrap_or_default();
        nlist.shuffle(&mut rng);
        stack.push(Frame {
            neigh: nlist,
            i: 0,
        });
    }

    ret
}

fn main() {
    let start = "41000029b01a003";

    // base_seed / tries / limits
    let base_seed: u64 = rand::thread_rng().next_u64();
    // let tries: u64 = 999_999_999;
    let tries: u64 = 100;
    let first_max_steps: u64 = 1_000_000;
    let final_max_steps: u64 = 1_000_000_000;
    let promising_max_steps: u64 = 10_000_000_000;
    // let promising_len: usize = 35000;
    // let max_pre_len: usize = 99999;
    let promising_len: usize = 30000;

    let g = load_graph();
    let pred = build_pred(&g);
    let gp2p = build_gp2p(&pred, start);

    let mut grand_champ: Vec<String>;
    let mut grand_champ_len: usize = 0;

    for t in 0..tries {
        let seed = base_seed + t;
        eprintln!("try={}/{} Seed={}", t + 1, tries, seed);

        let (steps, champ_len, champ) = find_cycle_from_start(
            &g,
            start,
            &gp2p,
            seed,
            t,
            tries,
            first_max_steps,
            final_max_steps,
            promising_max_steps,
            promising_len,
        );

        if champ_len > grand_champ_len {
            grand_champ_len = champ_len;
            grand_champ = champ;

            eprintln!("!!!!!!!!! New record !!!!!!!!!");
            println!("=== len={} seed={} t={} steps={}", champ_len, seed, t, steps);
            for n in &grand_champ {
                println!("{}", n);
            }
            use std::io::Write;
            std::io::stdout().flush().unwrap();

            eprintln!("sleeping...");
            thread::sleep(Duration::from_secs(10));
        }
    }
}
