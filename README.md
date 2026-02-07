# どうぶつしょうぎ名人 改造版

[どうぶつしょうぎ名人](https://github.com/mame/dobutsu-shogi-master)の機能追加版です.

[スクリーンショット](https://github.com/user-attachments/assets/15c45872-2891-4a8d-9864-c7f2ba39e9c3)

## デモ

* [お試し版](https://kaorahi.github.io/dobutsu-shogi-master/)

## 追加機能

* 先手でも後手でも指せる
* 対局のたびに指し手が変わる (最善手が複数あればランダムに選ぶ)
* 先手後手とも人間が指して検討
* 指定手数で勝てる局面をランダム出題
* 駒の動きのルール改変にも対応
* その他 (最善手順のアニメーション, 「せつめい」→「現局面へのリンク」)

改造版の使い方は INSTRUCTIONS.md を参照.

## 実装上の変更点

* 処理自体はローカルだが, `file://` では実行できず Web サーバが必要.
* 50MB 超のデータをダウンロード (本家の 300 倍). 実行時の処理も本家より重い.

本家は, 後手番のみで決まった最善手を指すことに専念して最適化. 改造版は, 最適化をやめて上記機能を実現.

[本家の最適化の工夫](https://d.hatena.ne.jp/ku-ma-me/20170211/p1)を台無しにしてしまったので, マージはめざさず改造版としてフォークします.

以下は本家の説明書.

# Dobutsu-Shogi master （どうぶつしょうぎ名人）

Dobutsu-Shogi is a much simpler variant of Shogi (Japanese chess), which is played on 3x4 board.  See the [Wikipedia article](https://en.wikipedia.org/wiki/D%C5%8Dbutsu_sh%C5%8Dgi) for the detail.

It is known that black (the starting player) cannot win if white plays perfectly.  This is a constructive proof; [Dobutsu-Shogi master](http://mame.github.io/dobutsu-shogi-master/) is a perfect player.  You can never beat it.  Enjoy the helplessness!

## How to build

~~~
$ make -C precomp
$ cd client
$ ruby images/setup.rb
$ npm install
$ npm run build
$ cd ..
$ open docs/index.html
~~~

## Directories

* `precomp/`: precompute the data base of the perfect play.
* `client/`: serves a UI for browser.
