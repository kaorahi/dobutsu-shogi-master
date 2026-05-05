import {AI} from "./ai";
import "./bootstrap";
import {UI} from "./ui";
import { XzReadableStream } from "xz-decompress";

async function fetch_xz(url: string) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok || !res.body) return new ArrayBuffer(0);
    return await new Response(new XzReadableStream(res.body)).arrayBuffer();
}

async function main(): Promise<{ ai: AI; ui: UI }> {
    // initialize UI
    $("#record-box, p.name.player-text").css("opacity", 0);
    const loading = $("#loading");
    const start_time = Date.now();
    const loading_timer = setInterval(() => {
        const sec = Math.floor((Date.now() - start_time) / 1000);
        $("#loading-count").text(` (${sec})`);
    }, 1000);
    // fetch
    const res = await fetch("rules.txt", { cache: "no-store" });
    const rules_txt = res.ok ? (await res.text()).trim() : 'val1n';
    const init_game_file_switch = new URLSearchParams(window.location.search).get("tmp_load_initial_game_record_txt_xz");
    const init_game_file = {
        "1": "initial_game_record1.txt.xz",
        "2": "initial_game_record2.txt.xz",
        "3": "initial_game_record3.txt.xz",
        "4": "initial_game_record4.txt.xz",
        "5": "initial_game_record5.txt.xz",
        "6": "initial_game_record6.txt.xz",
        "7": "initial_game_record7.txt.xz",
        "8": "initial_game_record8.txt.xz",
        "9": "initial_game_record9.txt.xz",
    }[init_game_file_switch || ""];
    let ibuf, kbuf, vbuf;
    try {
        ibuf = init_game_file ? await fetch_xz(init_game_file) : undefined;
        kbuf = await fetch_xz("keys.xz");
        vbuf = await fetch_xz("vals.xz");
    } catch {
        clearInterval(loading_timer);
        loading.text("ロード失敗").css("animation", "none");
        throw new Error("loading failed");
    }
    // build
    const init_game_txt = new TextDecoder("utf-8").decode(ibuf);
    const keys = new BigUint64Array(kbuf);
    for (let i = 1; i < keys.length; i++) {
        keys[i] = keys[i] + keys[i - 1];
    }
    const is_8bit = vbuf.byteLength === keys.length;
    const vals = is_8bit ? new Uint8Array(vbuf) : new Uint16Array(vbuf);
    const ai = new AI(rules_txt, keys, vals);
    const ui = new UI(ai, init_game_txt);
    // finalize
    clearInterval(loading_timer);
    loading.hide();
    $("#loading-count").text(``);
    $("#record-box, p.name.player-text").css("opacity", 1);
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
