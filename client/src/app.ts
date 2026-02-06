import {AI} from "./ai";
import "./bootstrap";
import {UI} from "./ui";

async function fetch_gunzip(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok || !res.body) return new ArrayBuffer(0);
  const ds = new DecompressionStream("gzip");
  const ab = await new Response(res.body.pipeThrough(ds)).arrayBuffer();
  return ab;
}

async function main(): Promise<{ ai: AI; ui: UI }> {
    const loading = $("#loading");
    (function loop() {loading.fadeOut(400).fadeIn(400, loop)});
    const res = await fetch("rules.txt", { cache: "no-store" });
    const rules_txt = res.ok ? (await res.text()).trim() : 'val1n';
    const [abuf, kbuf, vbuf] = await Promise.all([
        fetch_gunzip("unpruned_ai.txt.gz"),
        fetch_gunzip("keys.gz"),
        fetch_gunzip("vals.gz"),
    ]);
    const ai_txt = new TextDecoder("utf-8").decode(abuf);
    const keys = new BigUint64Array(kbuf);
    const vals = new Uint8Array(vbuf);
    const ai = new AI(rules_txt, ai_txt, keys, vals);
    const ui = new UI(ai);
    loading.hide();
    return {ai, ui};
}

import {Board, Piece, Result, isResult} from "./board";
import {Move, Normal, Drop} from "./move";
main().then(({ai, ui}) => {
    // for debug console
    Object.assign((window as any),
                  {AI},
                  {UI},
                  {Board, Piece, isResult},
                  {Move, Normal, Drop},
                  {ui, ai},
                 );
}).catch(console.error);
