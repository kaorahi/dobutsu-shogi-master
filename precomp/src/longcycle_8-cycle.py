#!/usr/bin/env python3

# Search for a simple cycle starting and ending at the same node
# without revisiting intermediate nodes, and print the node sequence.

import random
import sys
import time
from typing import Dict, List, Optional, Tuple

def load_graph() -> Dict[str, List[str]]:
    g: Dict[str, List[str]] = {}
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) >= 2:
            g[parts[0]] = parts[1:]
    return g

def find_cycle_from_start(
    g: Dict[str, List[str]],
    start: str,
    seed: int,
    first_max_steps: int,
    final_max_steps: int,
) -> Optional[List[str]]:

    rng = random.Random(seed)

    path: List[str] = [start]
    pos = {start: 0}
    champ_len = 0
    max_steps = first_max_steps
    ret = (0, [])

    stack: List[Tuple[str, List[str], int]] = []
    neigh0 = list(g.get(start, []))
    rng.shuffle(neigh0)
    stack.append((start, neigh0, 0))

    steps = 0
    while stack and steps < max_steps:
        steps += 1
        cur, neigh, i = stack[-1]

        if i >= len(neigh):
            stack.pop()
            if len(path) > 1:
                popped = path.pop()
                pos.pop(popped, None)
            if stack:
                pcur, pneigh, pi = stack[-1]
                stack[-1] = (pcur, pneigh, pi + 1)
            continue

        nxt = neigh[i]
        stack[-1] = (cur, neigh, i + 1)

        if nxt in pos:
            j = pos[nxt]
            cycle_len = len(path) - j
            if cycle_len > champ_len and cycle_len % 2 == 1:
            # if nxt == start and cycle_len > champ_len and cycle_len % 2 == 1:
                    print(f'Seed={seed} len={cycle_len} j={j} (steps={steps}/{max_steps})', file=sys.stderr)
                    champ_len = cycle_len
                    ret = (cycle_len, path + [nxt])
                    max_steps = min(max(max_steps, steps * 2), final_max_steps)
            continue

        pos[nxt] = len(path)
        path.append(nxt)

        nlist = list(g.get(nxt, []))
        rng.shuffle(nlist)
        stack.append((nxt, nlist, 0))

    return ret


def main():
    start = "41000029b01a003"

    # # [2026-02-19] champion record:
    # # Seed=8000303 len=40119 (steps=3589944033/7175032690)
    # base_seed = 8000300
    # tries = 5
    # first_max_steps = 1_000_000
    # final_max_steps = 10_000_000_000

    base_seed = 123
    tries = 100
    first_max_steps = 1_000_000
    final_max_steps = 1_000_000_000

    g = load_graph()

    grand_champ = []
    grand_champ_len = 0
    for t in range(tries):
        seed = base_seed + t
        print(f'try={t+1}/{tries} Seed={seed}', file=sys.stderr)
        champ_len, champ = find_cycle_from_start(
            g=g,
            start=start,
            seed=seed,
            first_max_steps=first_max_steps,
            final_max_steps=final_max_steps,
        )
        if champ_len > grand_champ_len:
            grand_champ_len = champ_len
            grand_champ = champ
            print(f'!!!!!!!!! New record !!!!!!!!!', file=sys.stderr)
            print(f'=== seed={seed} len={grand_champ_len}')
            for n in grand_champ:
                print(n)
            sys.stdout.flush()
            print(f'sleeping...', file=sys.stderr)
            time.sleep(10)

if __name__ == "__main__":
    main()
