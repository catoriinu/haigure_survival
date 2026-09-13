# 検証コードと設定

検証専用のコード・HTML・TypeScript設定・Vite設定は `validation/v2/<タスク>/` にまとめる。リポジトリ直下の `package.json` が各検証の起動入口であり、npmコマンドはリポジトリ直下で実行する。

例: `npm run dev:b05` は `validation/v2/B05/vite.config.mts` を使う。各検証の型検査は `npm run typecheck:<名前>`、ビルドは `npm run build:<名前>` で実行する。

| ディレクトリ | npmコマンドの名前 |
|---|---|
| `v2/B05/` | `b05` |
| `v2/T01/` ～ `v2/T06/` | `t01` ～ `t06` |
| `v2/T06-2/` ～ `v2/T06-4/` | `t06-2` ～ `t06-4` |
| `v2/T06-6A/` ～ `v2/T06-6D/` | `t06-6a` ～ `t06-6d` |

T07の回帰実行器は同じタスク内のVite設定を参照する。個別手順は [T07のREADME](v2/T07/README.md) を参照する。

## 保存するもの

検証コードと設定はGitで管理する。検証画像は `verification-images/<タスク名>/` または既存の `docs/plans/**/images/` のGit無視済みディレクトリへ保存し、Gitには追加しない。

## 通常実装の設定

- 通常Web: ルートの `vite.config.mts`、V2の型検査: `src/v2/tsconfig.json`。
- Electron: `electron/tsconfig.json`。出力先は従来どおり `dist-electron/`。
- 共通のTypeScript設定: ルートの `tsconfig.json`。
- エディターのworkspace: `.vscode/fps_survival20251226.code-workspace`。開くディレクトリはリポジトリ全体。

README、npm管理ファイル、通常Webの入口、共通・自動検出される設定、Gitの設定をルートに残し、個別検証の設定は各検証ディレクトリに置く。
