# 長周期千日手の探索

数万手周期の千日手の手順がみつかる.

## 探索の実行

`make -C precomp longcycle`

→ `precomp/` に以下のファイルが生成される. (数時間かかるかも)

* `r_val1n_longcycle_1.txt`: 引分局面のみからなる遷移グラフ. 各行は「局面 次局面 … 次局面」.
* `r_val1n_longcycle_2.txt`: 引分局面の遷移グラフの強連結成分. 各行は「局面 成分番号」.
* `r_val1n_longcycle_3.txt`: `_2` の逆引き. 各行は「成分番号 局面 … 局面」.
* `r_val1n_longcycle_4.txt`: 強連結成分どうしの接続関係 (DAG). 各行は「成分番号 次成分番号 … 次成分番号」.
* `r_val1n_longcycle_5.txt`: `_4` の逆引き. 各行は「成分番号 前成分番号 … 前成分番号」.
* `r_val1n_longcycle_6.txt`: サイズ最大の強連結成分に属する局面 (一行一局面).
* `r_val1n_longcycle_7.txt`: `_6` の局面のみからなる遷移グラフ. 各行は「局面 次局面 … 次局面」.
* `r_val1n_longcycle_8.txt`: `_7` 内での長いサイクルの探索結果. 新記録が出るたびに末尾へ追記.
* `r_val1n_longcycle_9.txt`: `_8` の最終チャンピオン. 出発局面から順に一手ごとの局面を並べたもの (一行一局面).

なお…

* 出発局面 `41000029b01a003` は, 初期局面から▲C3きりん△B3ひよこ▲同きりんと指した状態.
  * ▲C3きりん: 最善手の一つ
  * △B3ひよこ: 悪手 (後手勝ちだったのに先手勝ちになってしまった)
  * ▲同きりん: 悪手 (先手勝ちだったのに引分になってしまった)
* 「局面」は手番側から見たもの. 左右の反転を同一視する正規化がなされている.
* 「長いサイクル」は奇数周期のものを探索. なので, `_9` の冒頭行と最終行は, 「局面」(手番側から見た局面) は同じでも実は手番プレイヤーが逆. もう一周すると手番も戻る.
* 探索は乱数依存のヒューリスティックなもの. 乱数の種を設定するには `precomp/src/longcycle_8-cycle.rs` の `base_seed = ...` を変更. (その付近のパラメータも適当に調整)

## 結果の棋譜化

以下の手順で `longcycle.txt` を入手.

* `make -C precomp`
* `cp precomp/r_val1n_longcycle_9.txt docs`
* `ruby -run -e httpd docs -b localhost -p 8000` でローカル Web サーバを起動 (止めるには `Ctrl-C` キー)
* Web ブラウザで <http://localhost:8000/> を開く
* Web ブラウザの開発ツールを起動 (Firefox や Chrome なら `Ctrl+Shift+I`)
* 開発ツールの JavaScript コンソールで以下を実行 → `longcycle.txt` が「ダウンロード」される

```javascript
header=`
000a0039c41b002
0000b029c41a003
400a03090c1b002
`
orig = (header + await (await fetch("/r_val1n_longcycle_9.txt")).text()).split("\n").filter(x=>x)
bs = orig.map(s=>Board.from_hashstr(s))
unnormalized = bs.reduce((acc,cur) => !acc ? [cur.flip()] : [acc[0].next_boards(false).find(b=>b.reverse().normalize().hashstr()==cur.hashstr()).reverse(), ...acc], null).toReversed()
unturned = unnormalized.map((b,k) => k%2==0 ? b : b.reverse())

mov2csa = m => {
  piece_name = ['', 'LI', 'ZO', 'KI', 'HI', 'NI']
  col_name = ['A', 'B', 'C']
  xy2s = (x,y) => `${col_name[2-x]}${4-y}`
  np = m.new_board.get(m.nx, m.ny)
  s = Piece.mine_p(np) ? '+' : '-'
  from = (typeof m.p === "number") ? '00' : xy2s(m.x, m.y)
  to = xy2s(m.nx, m.ny)
  return s + from + to + piece_name[Piece.kind(np)]
}

to_file = (boards, fname) => {
  text = boards.map((b,k,a) => {m = k>0 && Move.detect_move(a[k-1],b); return [k, m ? m.toString() : '', m ? mov2csa(m) : '', b.hashstr(), (k%2===0 ? b : b.reverse()).normalize().hashstr()].join(',') + '\n' + b.toString() + '\n'}).join('')
  a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}))
  a.download = fname
  a.click()
  URL.revokeObjectURL(a.href)
}

to_file(unturned, 'longcycle.txt')
```

# longcycle.txt の内容

次のようなブロックが連続して書かれている.

```
3,▲B3きりん,+C3B3KI,410b0029031a000,41000029b01a003
gle c
...
.G.
EL. C
```

1行目:

* `3` → 3 手目
* `▲B3きりん` → ▲は先手, △は後手の着手. 筋は左からABC, 段は上から1234.
* `+C3B3KI` → [csa棋譜形式](https://www.computer-shogi.org/protocol/record_v22.html)風の着手表記. `+`は先手, `-`は後手の着手. C3からB3へきりんを移動した. (LI=ライオン, KI=きりん, ZO=ぞう, HI=ひよこ, NI=にわとり. 駒を打つ場合は `-00A4HI` のように `00` と表記)
* `410b0029031a000` → 着手後局面を表すハッシュ文字列 (盤面の向きは「先手側から見て」に固定). 詳しくは [INSTRACTIONS.md](https://github.com/kaorahi/dobutsu-shogi-master/blob/master/INSTRUCTIONS.md) を参照.
* `41000029b01a003` → 同じ局面を「次に指す手番側」から見たもの. 左右反転を同一視する正規化も適用. 上の探索結果ファイルに記録されているのはこちら.

その下4行: 先手側から見た着手後局面

* 左 3 列が盤面. 大文字は先手駒, 小文字は後手駒. l=ライオン (lion), e=象 (elephant), g=きりん (giraffe), c=ひよこ (chick), h=にわとり (hen).
* 盤面の右側は持駒. 大文字は先手持駒, 小文字は後手持駒.

## 結果のチェック

盤面表示を除いて棋譜行のみの CSV を抽出するには, grep を使うとよい.

```
$ grep , longcycle.txt | head -n 5
0,,,000b0029c41a003,000a0039c41b002
1,▲C3きりん,+C4C3KI,000b0029c41a030,0000b029c41a003
2,△B3ひよこ,-B2B3HI,400b00290c1a030,400a03090c1b002
3,▲B3きりん,+C3B3KI,410b0029031a000,41000029b01a003
4,△A2きりん,-A1A2KI,4100b029031a000,4100b029031a000
$ grep , longcycle.txt | tail -n 5
41916,△B2きりん,-C2B2KI,41100009b10a003,41100009b10a003
41917,▲B4ライオン,+B3B4LI,41100009b01a003,45000009031b002
41918,△C2ライオン,-B1C2LI,41100000b01a903,41100000b01a903
41919,▲A4ぞう,+00A4ZO,41000020b01a903,410a0009030b012
41920,△B1ライオン,-C2B1LI,41000029b01a003,41000029b01a003
```

3手目までは局面の準備. 3手目を指したあとの局面が「出発局面」 (後手番).

```
$ grep '^3,' -A 4 longcycle.txt
3,▲B3きりん,+C3B3KI,410b0029031a000,41000029b01a003
gle c
...
.G.
EL. C
```

一番最後の手を指したあとは, 出発局面の手番違いに戻っている (出発局面の盤面を上下ひっくり返した状態で, 先手番). ここからもう一周すれば, 「手番も含めた同一局面」に戻る. つまり, 下記なら周期は, `(41920-3)*2 = 83834手`.

```
$ tail -n 5 longcycle.txt
41920,△B1ライオン,-C2B1LI,41000029b01a003,41000029b01a003
.le c
.g.
...
ELG C
```

「手番側から見た局面」の重複は出発局面のみ.

```
$ grep , longcycle.txt | cut -d, -f5 | sort | uniq -cd
      2 41000029b01a003
$ grep 41000029b01a003 longcycle.txt
3,▲B3きりん,+C3B3KI,410b0029031a000,41000029b01a003
41920,△B1ライオン,-C2B1LI,41000029b01a003,41000029b01a003
```

一方, 「先手側から見た局面」には途中重複がある (手番が違う). つまり, 「何手もかけながら実質的にはパスしたのと同じ」という場面がある. 簡単な例で言えば, 自分のライオンが三角に動いて戻るあいだ (3 手) に, 相手のきりんが一往復 (2 手) すると, 配置は元どおりで手番が相手に移る.

```
$ grep , longcycle.txt | cut -d, -f4 | sort | uniq -cd | wc -l
1907
$ grep , longcycle.txt | cut -d, -f4 | sort | uniq -cd | sort | head -n 3
      2 00000009a31da35
      2 0000002db319042
      2 00000239a51db00
$ grep , longcycle.txt | cut -d, -f4 | sort | uniq -cd | sort | tail -n 3
      2 800b00200019032
      2 800b03209010002
      2 800b03290010002
$ grep -A 4 800b03290010002 longcycle.txt
24589,▲A3きりん,+B3A3KI,800b03290010002,020a0009001ab03
gl. cc
...
G..
ELE
--
24594,△B1ライオン,-A2B1LI,800b03290010002,80000029001b032
gl. cc
...
G..
ELE
$ grep , longcycle.txt | ruby -lane 'puts $_ if (24590..24594).include? $F[0].to_i'
24590,△B2ライオン,-B1B2LI,800b03209010002,80000020901b032
24591,▲B3きりん,+A3B3KI,800b00209310002,020a0009b10a003
24592,△A2ライオン,-B2A2LI,800b90200310002,80000020031b902
24593,▲A3きりん,+B3A3KI,800b93200010002,020a0009000ab13
24594,△B1ライオン,-A2B1LI,800b03290010002,80000029001b032
```

以下は, [田中哲朗先生の解析プログラム](https://www.tanaka.ecc.u-tokyo.ac.jp/ktanaka/dobutsushogi/index.html)による検証.

手順中で勝敗が変わった場面は, 出発局面より前の手のみ (2 手目△B3ひよこ: 後手勝→先手勝, 3 手目▲同きりん: 先手勝→引き分け). そこからの周期中に悪手はない (引き分けを保っている).

```
$ grep , longcycle.txt | cut -d , -f 3 | grep -v '^$' > moves.txt
$ ./checkcsa moves.txt 2>&1 | grep -- '->'
1 : -B2B3HI -1 -> 1
2 : +C3B3KI -1 -> 0
```

「初期局面から手順一式を指したあとの局面」も checkcsa による結果と一致 (最後にあえて不正手を追加して checkcsa を実行 → 「不正手直前の局面」が出力される).

```
$ cp moves.txt moves2.txt
$ echo '+0000LI' >> moves2.txt
$ ./checkcsa moves2.txt 2>&1 | tail -n 50 | fgrep -A 999 'Move : +0000LI'
Move : +0000LI
 . -LI-ZO
 . -KI .
 .  .  .
+ZO+LI+KI
100100
+

invalidMove +0000LI
terminate called after throwing an instance of 'InconsistentException'
$ tail -n 5 longcycle.txt
41920,△B1ライオン,-C2B1LI,41000029b01a003,41000029b01a003
.le c
.g.
...
ELG C
```

# 「往復」の結果

ここまでは「片道」の話. 「往復」を見たければ, 上記「結果の棋譜化」に続けて JavaScript コンソールで以下を実行し, `fullcycle.txt` を入手.

```javascript
b3 = unturned[3]; bz = unturned.at(-1); conv = b3.reverse().hashstr() === bz.hashstr() ? 'reverse' : 'revflip'
console.assert(b3[conv]().hashstr() === bz.hashstr())
back = unturned.slice(3).map(b => b[conv]())
to_file([...unturned, ...back.slice(1)], 'fullcycle.txt')
```

`fullcycle.txt` は, `longcycle.txt` に「復路」も追記したもの.

```
$ diff -U 5 longcycle.txt fullcycle.txt | head -n 14
--- longcycle.txt
+++ fullcycle.txt
@@ -209601,5 +209601,209590 @@
 41920,△B1ライオン,-C2B1LI,41000029b01a003,41000029b01a003
 .le c
 .g.
 ...
 ELG C
+41921,▲C3きりん,+C4C3KI,41000029b01a030,4100b029031a000
+.le c
+.g.
+..G
+EL. C
+41922,△C2ひよこ,-00C2HI,01000029b01ac30,01000029b01ac30
```

最終局面は出発局面と同一.

```
$ grep '^3,' -A 4 fullcycle.txt
3,▲B3きりん,+C3B3KI,410b0029031a000,41000029b01a003
gle c
...
.G.
EL. C
$ tail -n 5 fullcycle.txt
83837,▲B4ライオン,+A3B4LI,410b0029031a000,41000029b01a003
gle c
...
.G.
EL. C
```

長さの確認 (最初の 3 手は「初期局面 → 出発局面」. それ以後が「往復」)

```
$ grep , longcycle.txt | tail -n 1
41920,△B1ライオン,-C2B1LI,41000029b01a003,41000029b01a003
$ grep , fullcycle.txt | tail -n 1
83837,▲B4ライオン,+A3B4LI,410b0029031a000,41000029b01a003
$ ruby -e 'p 41920 * 2 - 3'
83837
```

「手番」と「手番側から見た局面」の重複は, 出発局面のみ.

```
$ grep , fullcycle.txt | cut -d , -f 2,5 | sed 's/[ABC][^,]*,/,/' | sort | uniq -cd
      2 ▲,41000029b01a003
$ grep '41000029b01a003$' fullcycle.txt
3,▲B3きりん,+C3B3KI,410b0029031a000,41000029b01a003
41920,△B1ライオン,-C2B1LI,41000029b01a003,41000029b01a003
83837,▲B4ライオン,+A3B4LI,410b0029031a000,41000029b01a003
```

checkcsa による確認も同様.

```
$ grep , fullcycle.txt | cut -d , -f 3 | grep -v '^$' > fullmoves.txt
$ ./checkcsa fullmoves.txt 2>&1 | grep -- '->'
1 : -B2B3HI -1 -> 1
2 : +C3B3KI -1 -> 0
```

一式を指したあとの局面も一致.

```
$ cp fullmoves.txt fullmoves2.txt
$ echo '+0000LI' >> fullmoves2.txt
$ ./checkcsa fullmoves2.txt 2>&1 | tail -n 50 | fgrep -A 999 'Move : +0000LI'
Move : +0000LI
-KI-LI-ZO
 .  .  .
 . +KI .
+ZO+LI .
100100
-

invalidMove +0000LI
terminate called after throwing an instance of 'InconsistentException'
$ tail -n 5 fullcycle.txt
83837,▲B4ライオン,+A3B4LI,410b0029031a000,41000029b01a003
gle c
...
.G.
EL. C
```
