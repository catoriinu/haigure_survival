# Noto Sans JP / Haigure Signage Subset FONTLOG

更新日: 2026-08-17

## ライセンスと帰属

- 原本: Noto Sans JP variable font
- 原本の著作権表示: `© 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.`
- ライセンス: SIL Open Font License 1.1
- 原本リポジトリ: `notofonts/noto-cjk`
- 固定commit: `f8d157532fbfaeda587e826d4cd5b21a49186f7c`
- 原本パス: `Sans/Variable/TTF/Subset/NotoSansJP-VF.ttf`
- Git blob: `12bd91340893f5b28ca26b99528a19f5f2fd7e89`
- 固定取得URL: `https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/Variable/TTF/Subset/NotoSansJP-VF.ttf`
- OFL取得URL: `https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/LICENSE`
- 原本: 9,590,732 bytes
- 原本SHA-256: `F4B373B226668EE33A6E54B02823DCD2D1209F17159F777421AE8C2275160369`

本リポジトリの`HaigureSignageSubset-Bold.ttf`は原本を変更したOFL 1.1のModified Versionである。原作者・貢献者の成果に謝意を表す。原作者または貢献者が本ゲームを推奨・承認していることを示すものではない。

## 変更内容

1. variable fontの`wght=700`を静的Boldへ変換した。
2. 表札、数字、ハイフン、エレベーターの「調整中」に必要な31 Unicode codepointへsubset化した。
3. primary font nameをReserved Font Nameと区別する`Haigure Signage Subset`へ変更した。
4. PostScript nameを`HaigureSignageSubset-Bold`へ変更した。
5. 原本の著作権、商標、作者、説明、OFL本文・URLのname metadataを維持した。
6. 日時依存timestampとHarfbuzz repackerを使用せず、tableを正規順で保存した。

生成物:

- パス: `assets/fonts/v2/B06/HaigureSignageSubset-Bold.ttf`
- 10,580 bytes
- SHA-256: `D41E2AB55B3F3267D915ADAE14B94F8C4ADEA3025E8C29D30C90B0D1E8218419`
- Unicode cmap: 31 codepoint
- glyph: `.notdef`を含む32 glyph
- `OS/2.usWeightClass=700`
- `OS/2.fsType=0`

## 使用glyph

```text
U+002D -
U+0031 1
U+0032 2
U+0033 3
U+0043 C
U+004C L
U+0050 P
U+4E2D 中
U+4F1A 会
U+4FDD 保
U+5065 健
U+54E1 員
U+56F3 図
U+5BA4 室
U+5BB6 家
U+5EAD 庭
U+5F92 徒
U+653E 放
U+6559 教
U+6574 整
U+66F8 書
U+697D 楽
U+7406 理
U+751F 生
U+79D1 科
U+7F8E 美
U+8077 職
U+8853 術
U+8ABF 調
U+9001 送
U+97F3 音
```

表示文字列は`3-1`～`3-3`、`2-1`～`2-3`、`1-1`～`1-3`、保健室、図書室、職員室、PC室、生徒会室、放送室、理科室、美術室、家庭科室、LL教室、音楽室、調整中である。主玄関、北通用口、プールの表札はゲーム内確認後の指示により撤去した。男性・女性ピクトグラムは文字glyphではなくPillowで描画した図形である。

## 再生成

Python 3.11.15で次を実行する。

```powershell
python -m venv .venv-b06-signage
.\.venv-b06-signage\Scripts\python.exe -m pip install -r scripts/v2/requirements-b06-signage.txt
.\.venv-b06-signage\Scripts\python.exe scripts/v2/build_b06_signage_font.py --source <固定commitから取得したNotoSansJP-VF.ttf>
.\.venv-b06-signage\Scripts\python.exe scripts/v2/build_b06_signage_atlas.py
```

固定tool:

- fontTools 4.63.0
- Pillow 12.3.0
- FreeType 2.14.3（使用したPillow Windows wheel）
- SignsPaper Atlas: 63,890 bytes
- Atlas SHA-256: `04D2E138C7B2C65A9F2987BC4F3115EF61DFC39F3F9228496E5DF7BEF3AF9351`
- manifest SHA-256: `563947A4C5EC4EA4A956BFA11D30D99FA0AAF8EB0810E5215A82CF871D457111`

## 配布

subset TTF、本文書、OFL全文はGitHubソース配布に含める。subset TTFは生成専用であり、Runtimeから参照せず、itch.io用production `dist/`には含めない。フォントはOFLのまま扱い、ゲーム本体のライセンスへ取り込まず、フォント単体では販売しない。
