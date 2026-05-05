// Find strictly connected components.
//
// Input: longcycle_1-next's output
//
// Output:
//   board component
//   ...
//
//   board: hex representation of bit-board
//   component: index of its component

#[macro_use]
extern crate precomp;

use std::io::{self, BufRead};
use std::collections::HashMap;

use precomp::{Out};

fn parse_hex_u64(s: &str) -> Option<u64> {
    let t = s.trim();
    if t.is_empty() {
        return None;
    }
    u64::from_str_radix(t, 16).ok()
}

fn read_all_lines_stdin() -> io::Result<Vec<String>> {
    let stdin = io::stdin();
    let mut lines = Vec::new();
    for line in stdin.lock().lines() {
        lines.push(line?);
    }
    Ok(lines)
}

fn load_nodes_build_index(lines: &[String]) -> io::Result<(Vec<u64>, HashMap<u64, u32>)> {
    let mut nodes: Vec<u64> = Vec::new();
    for line in lines {
        let mut it = line.split_whitespace();
        if let Some(tok) = it.next() {
            if let Some(b) = parse_hex_u64(tok) {
                nodes.push(b);
            }
        }
    }

    let mut index: HashMap<u64, u32> = HashMap::with_capacity(nodes.len() * 2);
    for (i, &b) in nodes.iter().enumerate() {
        index.insert(b, i as u32);
    }

    Ok((nodes, index))
}

fn build_csr(lines: &[String], index: &HashMap<u64, u32>, n: usize) -> io::Result<(Vec<u32>, Vec<u32>)> {
    // Pass 1: count out-degrees

    let mut out_deg: Vec<u32> = vec![0; n];

    for line in lines {
        let mut it = line.split_whitespace();
        let Some(src_tok) = it.next() else { continue };
        let Some(src_b) = parse_hex_u64(src_tok) else { continue };
        let Some(&src_id) = index.get(&src_b) else { continue };

        let mut cnt: u32 = 0;
        for tok in it {
            if let Some(dst_b) = parse_hex_u64(tok) {
                if index.contains_key(&dst_b) {
                    cnt += 1;
                }
            }
        }
        out_deg[src_id as usize] = cnt;
    }

    // Prefix sum -> offsets
    let mut offsets: Vec<u32> = vec![0; n + 1];
    for i in 0..n {
        offsets[i + 1] = offsets[i] + out_deg[i];
    }
    let m = offsets[n] as usize;

    // Pass 2: fill edges

    let mut edges: Vec<u32> = vec![0; m];
    let mut cursor: Vec<u32> = offsets[..n].to_vec(); // write positions per node

    for line in lines {
        let mut it = line.split_whitespace();
        let Some(src_tok) = it.next() else { continue };
        let Some(src_b) = parse_hex_u64(src_tok) else { continue };
        let Some(&src_id) = index.get(&src_b) else { continue };

        let mut pos = cursor[src_id as usize] as usize;
        for tok in it {
            if let Some(dst_b) = parse_hex_u64(tok) {
                if let Some(&dst_id) = index.get(&dst_b) {
                    edges[pos] = dst_id;
                    pos += 1;
                }
            }
        }
        cursor[src_id as usize] = pos as u32;
    }

    Ok((offsets, edges))
}

fn build_reverse_csr(n: usize, offsets: &[u32], edges: &[u32]) -> (Vec<u32>, Vec<u32>) {
    // Count in-degrees
    let mut in_deg: Vec<u32> = vec![0; n];
    for u in 0..n {
        let a = offsets[u] as usize;
        let b = offsets[u + 1] as usize;
        for &v in &edges[a..b] {
            in_deg[v as usize] += 1;
        }
    }

    // Prefix sum
    let mut roff: Vec<u32> = vec![0; n + 1];
    for i in 0..n {
        roff[i + 1] = roff[i] + in_deg[i];
    }
    let m = roff[n] as usize;

    // Fill reverse edges
    let mut redges: Vec<u32> = vec![0; m];
    let mut cursor: Vec<u32> = roff[..n].to_vec();

    for u in 0..n {
        let a = offsets[u] as usize;
        let b = offsets[u + 1] as usize;
        for &v in &edges[a..b] {
            let p = cursor[v as usize] as usize;
            redges[p] = u as u32;
            cursor[v as usize] += 1;
        }
    }

    (roff, redges)
}

fn kosaraju_scc(n: usize, off: &[u32], ed: &[u32], roff: &[u32], red: &[u32]) -> (Vec<u32>, u32) {
    // 1) Order by finish time on original graph (iterative DFS)
    let mut visited = vec![false; n];
    let mut order: Vec<u32> = Vec::with_capacity(n);

    for s in 0..n {
        if visited[s] {
            continue;
        }
        let mut stack: Vec<(u32, u32)> = Vec::new(); // (node, next_idx)
        visited[s] = true;
        stack.push((s as u32, 0));

        while let Some((u, i)) = stack.pop() {
            let u_us = u as usize;
            let start = off[u_us];
            let end = off[u_us + 1];
            let deg = end - start;

            if i < deg {
                stack.push((u, i + 1));
                let v = ed[(start + i) as usize] as usize;
                if !visited[v] {
                    visited[v] = true;
                    stack.push((v as u32, 0));
                }
            } else {
                order.push(u);
            }
        }
    }

    // 2) Assign components on reversed graph
    let mut comp: Vec<u32> = vec![u32::MAX; n];
    let mut comp_cnt: u32 = 0;

    for &s in order.iter().rev() {
        let s_us = s as usize;
        if comp[s_us] != u32::MAX {
            continue;
        }
        let mut stack: Vec<u32> = vec![s];
        comp[s_us] = comp_cnt;

        while let Some(u) = stack.pop() {
            let u_us = u as usize;
            let a = roff[u_us] as usize;
            let b = roff[u_us + 1] as usize;
            for &v in &red[a..b] {
                let v_us = v as usize;
                if comp[v_us] == u32::MAX {
                    comp[v_us] = comp_cnt;
                    stack.push(v);
                }
            }
        }

        comp_cnt += 1;
    }

    (comp, comp_cnt)
}

fn main() -> io::Result<()> {
    log!("LongCycle Step 2: Find strictly connected components");

    let lines = read_all_lines_stdin()?;
    let (nodes, index) = load_nodes_build_index(&lines)?;
    let n = nodes.len();

    let (off, ed) = build_csr(&lines, &index, n)?;
    let (roff, red) = build_reverse_csr(n, &off, &ed);

    let (comp, comp_cnt) = kosaraju_scc(n, &off, &ed, &roff, &red);

    let mut out = Out::new();

    for (i, &b) in nodes.iter().enumerate() {
        out!(out, "{:015x} {}\n", b, comp[i]);
    }

    log!("nodes {}", n);
    log!("edges {}", off[n] as usize);
    log!("components {}", comp_cnt);

    Ok(())
}
