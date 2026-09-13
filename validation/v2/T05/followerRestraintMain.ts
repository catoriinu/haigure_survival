import { runNpcCombatTests } from "./npcCombat.test";
import { runNpcCommandTests } from "./npcCommand.test";
import { runSurvivalRulesTests } from "./survivalRules.test";

const results = [
  ...await runNpcCombatTests(),
  ...await runNpcCommandTests(),
  ...runSurvivalRulesTests()
];
document.querySelector("#summary")!.textContent =
  `${results.filter(result => result.ok).length}/${results.length} PASS`;
document.querySelector("#results")!.textContent = JSON.stringify(results, null, 2);
