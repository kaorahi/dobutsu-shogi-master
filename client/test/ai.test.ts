/// <reference types="node" />

import * as assert from "power-assert";
import * as fs from "fs";
import * as path from "path";
import {XzReadableStream} from "xz-decompress";
import {AI} from "../src/ai";
import {Board} from "../src/board";

async function read_xz_buffer(file_path: string): Promise<ArrayBuffer> {
    const buf = fs.readFileSync(file_path);
    return await new Response(new XzReadableStream(new Blob([Uint8Array.from(buf)]).stream())).arrayBuffer();
}

async function load_ai(): Promise<AI> {
    const root = path.resolve(process.cwd(), "src/public");
    const [rules_txt, keys_ab, vals_ab] = await Promise.all([
        fs.promises.readFile(path.join(root, "rules.txt"), "utf8"),
        read_xz_buffer(path.join(root, "keys.xz")),
        read_xz_buffer(path.join(root, "vals.xz")),
    ]);
    const keys = new BigUint64Array(keys_ab);
    for (let i = 1; i < keys.length; i++) {
        keys[i] = keys[i] + keys[i - 1];
    }
    const is_8bit = vals_ab.byteLength === keys.length;
    const vals = is_8bit ? new Uint8Array(vals_ab) : new Uint16Array(vals_ab);
    return new AI(rules_txt.trim(), keys, vals);
}

describe("AI", function () {
    this.timeout(60000);

    let ai: AI;

    before(async function () {
        const root = path.resolve(process.cwd(), "src/public");
        const files = ["rules.txt", "keys.xz", "vals.xz"].map(name => path.join(root, name));
        if (!files.every(fs.existsSync)) this.skip();
        const rules_txt = fs.readFileSync(path.join(root, "rules.txt"), "utf8").trim();
        if (rules_txt !== "val1n") this.skip();
        ai = await load_ai();
    });

    it("should verify the documented sample depths", () => {
        const samples: [string, number][] = [
            ["000b0029c41a003", 78],
            ["400b00290c1a030", 69],
            ["4100b029031a000", -1],
            ["0040900a0a14053", 5],
            ["0400b210c430090", -1],
            ["5020090000d0310", 4],
            ["05409b05a000100", 3],
            ["2a0009000000010", 2],
            ["40ac90000000100", 1],
        ];
        samples.forEach(([h, d]) => {
            assert.equal(ai.verify_depth(Board.from_hashstr(h), d), true, h);
        });
    });
});
