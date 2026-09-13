import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const argument = (name) => {
  const value = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (value === undefined) throw new Error(`--${name}=で値を指定してください。`);
  return value.slice(name.length + 3);
};
const beforeDirectory = resolve(argument("before"));
const afterDirectory = resolve(argument("after"));
const output = resolve(argument("output"));
const median = (values) => [...values].sort((left, right) => left - right)[1];
const statistics = (values) => ({ values, median: median(values), minimum: Math.min(...values), maximum: Math.max(...values) });
const compare = (before, after) => {
  if (![...before, ...after].every((value) => typeof value === "number" && Number.isFinite(value))) {
    return { before, after, status: "unavailable", changePercent: null };
  }
  const beforeStats = statistics(before);
  const afterStats = statistics(after);
  const changePercent = beforeStats.median === 0
    ? afterStats.median === 0 ? 0 : null
    : (afterStats.median / beforeStats.median - 1) * 100;
  return { before: beforeStats, after: afterStats, changePercent,
    status: changePercent === null ? "incomparable" : afterStats.median <= beforeStats.median * 1.05 ? "passed" : "failed" };
};
const conditions = (run) => ({
  environment: Object.fromEntries(["platform", "release", "cpu", "logicalCpus", "totalMemoryBytes", "node", "runtime", "profile",
    "instrumentHash", "browserExecutable", "materialFingerprint", "powerSchemeGuid", "stressInputMode", "stressInputRequestHash", "gc", "cache"]
    .map((key) => [key, run.environment[key]])),
  profile: run.report.profile, seed: run.report.seed, view: run.report.view,
  population: run.report.population, graphics: run.context.graphics, userAgent: run.context.userAgent, display: run.context.display,
  measurement: Object.fromEntries(["catalogFingerprint", "sessionSeed", "snapshot", "roomVariantSelections", "camera", "features",
    "materialMode", "characterAssignments", "defaultPortraitActorCount", "bgmUrl", "bgmCount", "voiceDirectoryCount", "portraitFileCount"]
    .map((key) => [key, run.context.measurement[key]]))
});
const readArtifact = async (path) => {
  try {
    return { ...JSON.parse(await readFile(path, "utf8")), artifact: path };
  } catch (error) {
    return { artifact: path, artifactReadFailure: error.message };
  }
};
const measurementFiles = (runtime, profile) => [
  "src/v2/performanceDiagnostics.ts",
  "src/v2/main.ts",
  "src/v2/survivalRuntime.ts",
  "src/v2/bitSystem.ts",
  "validation/v2/T07/runPerformance.mjs",
  "validation/v2/T07/mediaObservation.mjs",
  ...(profile === "stress" ? ["src/v2/performanceStressWorkload.ts"] : []),
  ...(runtime === "electron" ? ["validation/v2/T07/performanceElectron.cjs"] : [])
];
const requiredChecks = (profile) => [
  "collectionCompleted", "measurementConfiguration", "instrumentationUnchanged", "runtimeDiagnosticsClear",
  "localMaterialsPresent", "audioActive", "pointerLockKept", "finalOwnersReleased",
  ...(profile === "normal" ? ["numericalPerformance"] : ["stressWorkload", "stressInputRequestsMatch"])
];
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isMeasuredNumber = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const groups = [];
const saveGroup = async (group) => {
  groups.push(group);
  await writeFile(output, JSON.stringify({ generatedAt: new Date().toISOString(),
    representative: "各条件3回の中央値。単回の合否・範囲を併記。保持heapの主要比較はGC後usedSize。backingStorageSizeは補助で未取得を保持する。保持リークは独立の再開始測定で判定する。",
    groups }, null, 2), "utf8");
};
for (const runtime of ["web", "electron"]) {
  for (const profile of ["normal", "stress"]) {
    const readRuns = (directory, label) => Promise.all([1, 2, 3].map((run) =>
      readArtifact(resolve(directory, `${label}-${runtime}-${profile}-${run}.json`))));
    const before = await readRuns(beforeDirectory, "before");
    const after = await readRuns(afterDirectory, "after");
    const manifests = await Promise.all([
      readArtifact(resolve(beforeDirectory, `before-${runtime}-${profile}-source.json`)),
      readArtifact(resolve(afterDirectory, `after-${runtime}-${profile}-source.json`))
    ]);
    const all = [...before, ...after];
    const allRuns = all.map((run) => ({ artifact: run.artifact, failure: run.failure ?? null,
      artifactReadFailure: run.artifactReadFailure ?? null, checks: run.checks ?? null, localAcceptance: run.localAcceptance ?? null }));
    const missingEvidence = [];
    const sampleWindows = profile === "stress" ? ["stress"] : ["cold", "steady"];
    for (const run of all) {
      if (run.artifactReadFailure) missingEvidence.push({ artifact: run.artifact, field: "artifact", detail: run.artifactReadFailure });
      for (const field of ["environment", "source", "report", "context", "checks"]) {
        if (!isRecord(run[field])) missingEvidence.push({ artifact: run.artifact, field });
      }
      if (!isRecord(run.context?.measurement)) missingEvidence.push({ artifact: run.artifact, field: "context.measurement" });
      if (typeof run.source?.treeHash !== "string" || run.source.treeHash.length === 0) {
        missingEvidence.push({ artifact: run.artifact, field: "source.treeHash" });
      }
      for (const check of requiredChecks(profile)) {
        if (typeof run.checks?.[check] !== "boolean") missingEvidence.push({ artifact: run.artifact, field: `checks.${check}` });
      }
      for (const window of sampleWindows) {
        for (const metric of ["frameWorkTimeMs", "frameIntervalTimeMs", "totalFrameTimeMs"]) {
          for (const percentile of ["p95", "p99"]) {
            if (!isMeasuredNumber(run.report?.[window]?.[metric]?.[percentile])) {
              missingEvidence.push({ artifact: run.artifact, field: `report.${window}.${metric}.${percentile}` });
            }
          }
        }
      }
      if (!isMeasuredNumber(run.retainedHeap?.heap?.usedSize)) {
        missingEvidence.push({ artifact: run.artifact, field: "retainedHeap.heap.usedSize" });
      }
      if (run.retainedHeap?.outsideMeasurement !== true) {
        missingEvidence.push({ artifact: run.artifact, field: "retainedHeap.outsideMeasurement" });
      }
    }
    for (const manifest of manifests) {
      if (manifest.artifactReadFailure) missingEvidence.push({ artifact: manifest.artifact, field: "artifact", detail: manifest.artifactReadFailure });
      if (!Array.isArray(manifest.files) || !manifest.files.every((file) => Array.isArray(file) && file.length === 2 &&
        file.every((value) => typeof value === "string" && value.length > 0))) {
        missingEvidence.push({ artifact: manifest.artifact, field: "files" });
      }
      if (typeof manifest.treeHash !== "string" || manifest.treeHash.length === 0) {
        missingEvidence.push({ artifact: manifest.artifact, field: "treeHash" });
      }
    }
    if (missingEvidence.length > 0) {
      await saveGroup({ runtime, profile, sameConditions: null, sourceFixedWithinGroups: null,
        sourceManifestsMatchRuns: null, measurementSourcesMatch: null, completeEvidence: false,
        absolutePerformance: null, withinFivePercent: null, metrics: {}, supplementalMetrics: {},
        missingEvidence, runs: allRuns, sourceManifests: manifests.map((manifest) => manifest.artifact), status: "incomplete" });
      continue;
    }
    const sourceMaps = manifests.map((manifest) => new Map(manifest.files));
    const measurementSourceComparison = measurementFiles(runtime, profile).map((path) => ({ path,
      before: sourceMaps[0].get(path) ?? null, after: sourceMaps[1].get(path) ?? null }));
    const measurementSourcesAvailable = measurementSourceComparison.every((file) => typeof file.before === "string" && typeof file.after === "string");
    const measurementSourcesMatch = measurementSourcesAvailable && measurementSourceComparison.every((file) => file.before === file.after);
    const sourceManifestsMatchRuns = [before, after].every((runs, index) => runs.every((run) => run.source.treeHash === manifests[index].treeHash));
    const sameConditions = new Set(all.map((run) => JSON.stringify(conditions(run)))).size === 1;
    const sourceFixedWithinGroups = [before, after].every((runs) => new Set(runs.map((run) => run.source.treeHash)).size === 1);
    const metrics = {};
    for (const window of sampleWindows) {
      for (const metric of ["frameWorkTimeMs", "frameIntervalTimeMs", "totalFrameTimeMs"]) {
        for (const percentile of ["p95", "p99"]) {
          metrics[`${window}.${metric}.${percentile}`] = compare(
            before.map((run) => run.report[window]?.[metric]?.[percentile]),
            after.map((run) => run.report[window]?.[metric]?.[percentile]));
        }
      }
    }
    metrics["retainedHeap.usedSize"] = compare(before.map((run) => run.retainedHeap?.heap?.usedSize), after.map((run) => run.retainedHeap?.heap?.usedSize));
    const supplementalMetrics = {
      "retainedHeap.backingStorageSize": compare(before.map((run) => run.retainedHeap?.heap?.backingStorageSize), after.map((run) => run.retainedHeap?.heap?.backingStorageSize))
    };
    const completeEvidence = measurementSourcesAvailable && all.every((run) => !run.failure && Object.entries(run.checks).every(([key, value]) =>
      key === "numericalPerformance" || value !== false));
    const absolutePerformance = profile === "normal" ? after.every((run) => run.checks.numericalPerformance === true) : null;
    const withinFivePercent = Object.values(metrics).every((metric) => metric.status === "passed");
    const comparable = sameConditions && sourceFixedWithinGroups && sourceManifestsMatchRuns && measurementSourcesMatch;
    await saveGroup({ runtime, profile, sameConditions, sourceFixedWithinGroups, sourceManifestsMatchRuns,
      measurementSourcesMatch, measurementSourceComparison, completeEvidence, absolutePerformance,
      withinFivePercent, metrics, supplementalMetrics, runs: allRuns, sourceManifests: manifests.map((manifest) => manifest.artifact),
      status: !completeEvidence ? "incomplete" : !comparable ? "incomparable" :
        profile === "normal" ? absolutePerformance ? "passed" : "failed" : withinFivePercent ? "passed" : "failed" });
  }
}
for (const group of groups) {
  process.stdout.write(`${group.runtime}/${group.profile}: ${group.status}（同条件=${group.sameConditions}, 計測版一致=${group.measurementSourcesMatch}, 証拠完備=${group.completeEvidence}, 5%以内=${group.withinFivePercent}）\n`);
}
if (groups.some((group) => group.status !== "passed")) process.exitCode = 1;
