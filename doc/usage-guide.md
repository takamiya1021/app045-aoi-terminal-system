# Aoi-Terminals 使用方法ガイド（画用紙風イラスト版）

お嬢が Aoi-Terminals を使って WSL にアクセスするまでのステップを、画用紙に描いたような柔らかく温かいイラストで解説するで！

![使用方法の画用紙風イラスト](file:///home/ustar-wsl-2-2/.gemini/antigravity/brain/fd5f10b7-3317-424e-922b-57ca5f483f1d/usage_flow_drawing_paper_jp_1766658670515.png)

### アクセスまでの 4 ステップ：

1.  **Start コマンド実行！ (PC)**
    WSL(Ubuntu) の `~/.aoi-terminals/` フォルダで `./aoi-terminals start` を実行。
    システムが Windows 側の Tailscale IP を自動で見つけて、ログイン用のトークンと一緒に QR コードをデカデカと表示するで。

2.  **スマホでパシャッ！ (Mobile)**
    スマホのカメラでその QR コードをスキャン。
    Tailscale IP の入った特別な URL が読み取られて、ブラウザが立ち上がるんや。

3.  **Tailscale VPN 経由で接続！ (Network)**
    お嬢のスマホと PC が Tailscale（Tailnet）という秘密のトンネルで繋がるで。
    場所を選ばず、安全に自宅の WSL にアクセスできる魔法の瞬間やな。

4.  **WSL 開通！ (Terminal)**
    ブラウザにターミナル画面が表示されたら成功！
    スマホから WSL のシェル（bash / tmux）を自由自在に操れるようになるで。

---
**ヒント:**
もし繋がらないときは、スマホ側でも Tailscale アプリが「Active」になっとるか確認してみてな！
