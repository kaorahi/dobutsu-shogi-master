# 「どうぶつしょうぎ名人」改造版を Google Colaboratory で

以下のコピペで, 完全解析と Web アプリのビルドができます (2026-02 現在).

```
# 準備
!apt install time cargo ruby npm imagemagick
!npm install -g n && n stable && hash -r
!git clone --single-branch --branch master --depth=1 https://github.com/kaorahi/dobutsu-shogi-master.git
%cd dobutsu-shogi-master
!(cd client; npm install; npm audit fix)

# 実行 (RULES= でルール指定. 02014 はすぐ終わる例. 現行ルール val1n だと 40 分以上)
!make -C precomp RULES=02014
!zip -r ../docs.zip docs
```

できあがった docs.zip をダウンロード・展開して, ローカルマシンで…

1. Ruby または Python をインストール
2. ターミナル上で docs ディレクトリに移動
3. 以下のコマンドでローカル Web サーバを起動 (止めるには `Ctrl-C` キー)

Ruby の場合:
```
ruby -run -e httpd . -b localhost -p 8000
```

Python の場合:
```
python3 -m http.server 8000 --bind localhost
```

あとは, Web ブラウザで <http://localhost:8000/> を開いて閲覧
