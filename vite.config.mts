import { defineConfig } from "vite";

const toPosixPath = (value: string) => value.replace(/\\/g, "/");

export default defineConfig({
  base: "./",
  server: {
    port: 5175,
    strictPort: true
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = toPosixPath(id);
          if (normalizedId.includes("/node_modules/@babylonjs/")) {
            return "babylon";
          }
          if (normalizedId.includes("/src/audio/")) {
            return "audio";
          }
          if (
            normalizedId.includes("/src/ui/") ||
            normalizedId.includes("/src/game/titleStartPreparation.ts")
          ) {
            return "title-ui";
          }
          if (
            normalizedId.includes("/src/game/dynamicBeam/") ||
            normalizedId.includes("/src/game/trap/") ||
            normalizedId.includes("/src/game/alarm/") ||
            normalizedId.includes("/src/game/playerAbility.ts") ||
            normalizedId.includes("/src/game/playerMotion.ts")
          ) {
            return "game-systems";
          }
          if (
            normalizedId.includes("/src/game/entities.ts") ||
            normalizedId.includes("/src/game/npcs.ts") ||
            normalizedId.includes("/src/game/bits.ts") ||
            normalizedId.includes("/src/game/beams.ts") ||
            normalizedId.includes("/src/game/beamCollision.ts") ||
            normalizedId.includes("/src/game/hitEffects.ts") ||
            normalizedId.includes("/src/game/characterScene.ts") ||
            normalizedId.includes("/src/game/runtimeFrame.ts") ||
            normalizedId.includes("/src/game/characterBillboardMeshes.ts") ||
            normalizedId.includes("/src/game/groundShadows.ts") ||
            normalizedId.includes("/src/game/spriteUtils.ts")
          ) {
            return "game-entities";
          }
          if (normalizedId.includes("/src/world/")) {
            return "world";
          }
          return undefined;
        }
      }
    }
  }
});
