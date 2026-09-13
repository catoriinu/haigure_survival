import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import baseConfig from "../../../vite.config.mts";

// 比較側だけ保存した変更前の2モジュールを読む。作業木を書き戻さない。
const baselineDirectory = process.env.NPC_PATROL_BASELINE_DIRECTORY;
export default defineConfig({
  ...baseConfig,
  cacheDir: `node_modules/.vite-npc-patrol-${baselineDirectory ? "before" : "after"}`,
  plugins: [...baseConfig.plugins!, {
    name: "npc-patrol-before",
    enforce: "pre",
    load(id) {
      const normalized = id.replaceAll("\\", "/");
      for (const name of ["npcSystem.ts", "combatTypes.ts"]) {
        if (normalized.endsWith(`/src/v2/${name}`)) {
          const source = readFileSync(baselineDirectory ? resolve(baselineDirectory, name) : id, "utf8");
          if (name !== "npcSystem.ts") return source;
          return 'import { attachNpcPatrolProbe } from "/validation/v2/T05/npcPatrolProbe.ts";\n' +
            source.replace("=> new SchoolV2NpcSystem(options);", "=> attachNpcPatrolProbe(new SchoolV2NpcSystem(options));");
        }
      }
      return null;
    }
  }],
  server: { port: baselineDirectory ? 5182 : 5183, strictPort: true, hmr: false }
});
