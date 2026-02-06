import {AI} from "./ai";
import "./bootstrap";
import {UI} from "./ui";
//@ts-ignore
import rules_txt from "../../precomp/rules.txt?raw";

async function fetch_gunzip(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok || !res.body) return new ArrayBuffer(0);
  const ds = new DecompressionStream("gzip");
  const ab = await new Response(res.body.pipeThrough(ds)).arrayBuffer();
  return ab;
}

async function main() {
    const [abuf, kbuf, vbuf] = await Promise.all([
        fetch_gunzip("unpruned_ai.txt.gz"),
        fetch_gunzip("keys.gz"),
        fetch_gunzip("vals.gz"),
    ]);
    const ai_txt = new TextDecoder("utf-8").decode(abuf);
    const keys = new BigUint64Array(kbuf);
    const vals = new Uint8Array(vbuf);
    new UI(new AI(rules_txt, ai_txt, keys, vals));
}

main().catch(console.error);
