import { runNpcCombatTests } from "./npcCombat.test";
import { runTargetSelectionTests } from "./targetSelection.test";
import { runNpcPatrolBenchmark } from "./npcPatrolBenchmark";

const results = [...runTargetSelectionTests(), ...await runNpcCombatTests()];
document.querySelector("#summary")!.textContent =
  `${results.filter(result => result.ok).length}/${results.length} PASS`;
document.querySelector("#results")!.textContent = JSON.stringify(results, null, 2);
document.querySelector("#benchmark")!.addEventListener("click", async () => {
  const output = document.querySelector("#benchmark-results")!;
  output.textContent = "計測中";
  output.textContent = JSON.stringify(await runNpcPatrolBenchmark(), null, 2);
});
