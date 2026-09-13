import { NullEngine, Scene, StandardMaterial } from "@babylonjs/core";
import { createStageCatalogFingerprint, SCHOOL_STAGE } from "../../../src/world/stageCatalog";
import {
  createSchoolRoomVariantSelections,
  createSchoolRuntimeSettings
} from "../../../src/world/schoolRuntimeSettings";
import {
  createSchoolStageDynamicSpatialInitializationDescriptor,
  createSchoolStageInitialActiveSet
} from "../../../src/world/schoolStageDynamicRuntime";
import {
  createStageSpatialSession,
  getStageSpatialOwnershipDiagnostics,
  loadStageStaticSpatialResources
} from "../../../src/world/stageSpatialContext";
import {
  replaceV2StageStaticResourceSlot
} from "../../../src/v2/stageSessionLifecycle";
import {
  acquireV2ConstructionOwner,
  installV2RuntimeApplicationTermination
} from "../../../src/v2/runtimeApplicationLifecycle";
import { assert, executeTest } from "../T06/testUtils";
import { V2_DEFAULT_TITLE_SETTINGS } from "../../../src/v2TitleSettingsStore";
import {
  createV2SessionStartSnapshot,
  selectV2FailedSessionRetryRequest
} from "../../../src/v2/titleSettingsSession";
import { runLocationAssetRegistryAcceptance } from "../B05/locationAssetRegistryAcceptance";
import { createV2CharacterVisualRuntime } from "../../../src/v2/v2CharacterVisualRuntime";
import {
  V2_DEFAULT_PORTRAIT_DIRECTORY
} from "../../../src/v2/v2CharacterAssignments";
import { V2_PORTRAIT_ASSET_CATALOG } from "../../../src/v2/v2PortraitAssetCatalog";
import { runRuntimeSessionLifecycleTests } from "../T06/runtimeSessionLifecycle.test";
import {
  createV2RuntimeConstructionRollbackStack,
  V2_RUNTIME_CONSTRUCTION_OWNER_ORDER
} from "../../../src/v2/runtimeConstructionRollback";

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return Object.freeze({ promise, resolve });
};
type FixtureStatic = Readonly<{
  fingerprint: string;
  identity: number;
  dispose(): void;
}>;

export const runT06_6DTests = async () => [
  await executeTest("catalog fingerprint全field固定順", () => {
    const baseline = createStageCatalogFingerprint(SCHOOL_STAGE);
    const variants = [
      { ...SCHOOL_STAGE, id: "school-next" },
      { ...SCHOOL_STAGE, label: "学校2" },
      { ...SCHOOL_STAGE, glbUrl: `${SCHOOL_STAGE.glbUrl}.next` },
      { ...SCHOOL_STAGE, navmeshUrl: `${SCHOOL_STAGE.navmeshUrl}.next` },
      { ...SCHOOL_STAGE, bitNavmeshUrl: `${SCHOOL_STAGE.bitNavmeshUrl}.next` },
      { ...SCHOOL_STAGE, assetSchemaVersion: SCHOOL_STAGE.assetSchemaVersion + 1 },
      { ...SCHOOL_STAGE, navProfileId: `${SCHOOL_STAGE.navProfileId}-next` },
      { ...SCHOOL_STAGE, bitNavProfileId: `${SCHOOL_STAGE.bitNavProfileId}-next` },
      { ...SCHOOL_STAGE, glbSha256: "0".repeat(64) },
      { ...SCHOOL_STAGE, navmeshSha256: "1".repeat(64) },
      { ...SCHOOL_STAGE, bitNavmeshSha256: "2".repeat(64) },
      { ...SCHOOL_STAGE, depthPrePassMaterialNames: ["A", "B"] },
      { ...SCHOOL_STAGE, worldBoundaryMode: "unsupported" as const },
      { ...SCHOOL_STAGE, locationAssetsMode: "unsupported" as const },
      {
        ...SCHOOL_STAGE,
        roomVariantNavmesh: { mode: "unsupported" as const }
      },
      {
        ...SCHOOL_STAGE,
        roomVariantNavmesh: {
          mode: "required" as const,
          url: `${SCHOOL_STAGE.roomVariantNavmesh.mode === "required" ? SCHOOL_STAGE.roomVariantNavmesh.url : ""}.next`,
          sha256: "3".repeat(64)
        }
      }
    ];
    assert(
      variants.every((variant) => createStageCatalogFingerprint(variant) !== baseline),
      "StageCatalogEntryの変更をfingerprintが検出できません。"
    );
    assert(
      baseline === createStageCatalogFingerprint({ ...SCHOOL_STAGE }),
      "同一catalogのfingerprintが決定的ではありません。"
    );
    return `required URL／SHAとunsupported modeを含む全fieldを検出、${baseline.length}文字`;
  }),
  await executeTest("同一fingerprintのproduction static slot再利用", async () => {
    let slot: FixtureStatic | null = null;
    let loadCount = 0;
    const load = async (fingerprint: string): Promise<FixtureStatic> => {
      loadCount += 1;
      return Object.freeze({ fingerprint, identity: loadCount, dispose: () => {} });
    };
    const identities: number[] = [];
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const owner = await replaceV2StageStaticResourceSlot(
        { get: () => slot, set: (value) => { slot = value; } },
        "catalog-A",
        load,
        () => false
      );
      identities.push(owner.identity);
    }
    assert(loadCount === 1 && new Set(identities).size === 1, "static slotが再利用されませんでした。");
    return "production replace helper: 4要求でload 1回・identity不変";
  }),
  await executeTest("catalog変更とload失敗後のproduction static slot再試行", async () => {
    const events: string[] = [];
    let slot: FixtureStatic | null = null;
    let failCatalogB = true;
    let identity = 0;
    const load = async (fingerprint: string): Promise<FixtureStatic> => {
      events.push(`load:${fingerprint}`);
      if (fingerprint === "catalog-B" && failCatalogB) {
        throw new Error("fixture catalog-B load failure");
      }
      const ownerIdentity = ++identity;
      return Object.freeze({
        fingerprint,
        identity: ownerIdentity,
        dispose: () => events.push(`dispose:${fingerprint}:${ownerIdentity}`)
      });
    };
    const staticSlot = { get: () => slot, set: (value: FixtureStatic | null) => { slot = value; } };
    await replaceV2StageStaticResourceSlot(staticSlot, "catalog-A", load, () => false);
    await replaceV2StageStaticResourceSlot(staticSlot, "catalog-B", load, () => false).catch(() => null);
    assert(slot === null, "catalog load失敗後にslotがnullではありません。");
    failCatalogB = false;
    const retried = await replaceV2StageStaticResourceSlot(staticSlot, "catalog-B", load, () => false);
    assert(
      retried.fingerprint === "catalog-B" && events.join("|") ===
        "load:catalog-A|dispose:catalog-A:1|load:catalog-B|load:catalog-B",
      `catalog変更・再試行順が不正です: ${events.join("|")}`
    );
    return "production replace helper: old dispose→load、失敗slot null→手動再試行";
  }),
  await executeTest("static load中終了の遅延owner非公開", async () => {
    const deferred = createDeferred<FixtureStatic>();
    let slot: FixtureStatic | null = null;
    let cancelled = false;
    let disposeCount = 0;
    const transition = replaceV2StageStaticResourceSlot(
      { get: () => slot, set: (value) => { slot = value; } },
      "catalog-delayed",
      () => deferred.promise,
      () => cancelled
    );
    cancelled = true;
    deferred.resolve(Object.freeze({
      fingerprint: "catalog-delayed",
      identity: 1,
      dispose: () => { disposeCount += 1; }
    }));
    await transition.catch(() => null);
    assert(slot === null && disposeCount === 1, "終了後に遅延static ownerが公開または残留しました。");
    return "production replace helper: 遅延static dispose 1回・slot非公開";
  }),
  await executeTest("main構築ownerの取得逆順rollback", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const sceneMaterialBaseline = scene.materials.length;
    const stack = createV2RuntimeConstructionRollbackStack();
    const acquired: string[] = [];
    const rolledBack: string[] = [];
    const baseline = new Set<string>();
    const owners = new Set<string>();
    const originalError = new Error("fixture main construction failure");
    let observedError: unknown = null;
    try {
      for (const label of V2_RUNTIME_CONSTRUCTION_OWNER_ORDER) {
        acquired.push(label);
        owners.add(label);
        const material = new StandardMaterial(`fixture-${label}`, scene);
        stack.register(label, () => {
          material.dispose();
          owners.delete(label);
          rolledBack.push(label);
        });
        if (label === "navigation-policy") {
          throw originalError;
        }
      }
    } catch (error) {
      stack.rollback();
      observedError = error;
    }
    assert(
      observedError === originalError &&
        rolledBack.join("|") === [...acquired].reverse().join("|") &&
        owners.size === baseline.size &&
        scene.materials.length === sceneMaterialBaseline,
      `main construction rollbackが不正です: ${acquired.join("|")} / ${rolledBack.join("|")}`
    );
    scene.dispose();
    engine.dispose();
    return "production rollback stack: main登録順、逆順、元Error identity、owner baseline";
  }),
  await executeTest("production beforeunload同期破棄順", () => {
    const target = new EventTarget();
    const events: string[] = [];
    let dynamicDisposeInvocationCount = 0;
    const disposeDynamicSession = () => {
      dynamicDisposeInvocationCount += 1;
      events.push("dynamic-dispose");
    };
    let constructionRollback: (() => void) | null = disposeDynamicSession;
    let activeSession: Readonly<{ disposeSynchronously(): void }> | null =
      Object.freeze({ disposeSynchronously: disposeDynamicSession });
    const coordinator = installV2RuntimeApplicationTermination({
      eventTarget: target as unknown as Window,
      markTerminated: () => events.push("terminated"),
      stopRenderLoop: () => events.push("render-stop"),
      markPageUnloading: () => events.push("page-unloading"),
      takeConstructionRollback: () => {
        const rollback = constructionRollback;
        constructionRollback = null;
        return activeSession === null ? rollback : null;
      },
      takeDynamicSession: () => {
        const session = activeSession;
        activeSession = null;
        return session;
      },
      disposeApplicationUi: () => events.push("ui-dispose"),
      takeStaticResources: () => Object.freeze({
        cancelSessionConstructionSynchronously: () => events.push("static-cancel"),
        dispose: () => events.push("static-dispose")
      }),
      disposeAmbientLight: () => events.push("light-dispose"),
      disposeScene: () => events.push("scene-dispose"),
      disposeEngine: () => events.push("engine-dispose")
    });
    target.dispatchEvent(new Event("beforeunload"));
    coordinator.terminate();
    target.dispatchEvent(new Event("beforeunload"));
    const expectedEvents = [
      "terminated",
      "render-stop",
      "page-unloading",
      "dynamic-dispose",
      "ui-dispose",
      "static-cancel",
      "static-dispose",
      "light-dispose",
      "scene-dispose",
      "engine-dispose"
    ];
    assert(
      coordinator.isTerminated() &&
        dynamicDisposeInvocationCount === 1 &&
        events.join("|") === expectedEvents.join("|"),
      `beforeunload同期順が不正です: ${events.join("|")}`
    );
    return "production termination helper: active dynamic→static→Scene→Engineを各1回";
  }),
  await executeTest("character visual待機中終了の遅延owner回収", async () => {
    const delayedVisual = createDeferred<Readonly<{ dispose(): void }>>();
    let cancelled = false;
    let disposeCount = 0;
    const initialization = acquireV2ConstructionOwner({
      label: "fixture character visual",
      create: () => delayedVisual.promise,
      isCancelled: () => cancelled,
      dispose: (visual) => visual.dispose()
    });
    const target = new EventTarget();
    const events: string[] = [];
    installV2RuntimeApplicationTermination({
      eventTarget: target as unknown as Window,
      markTerminated: () => {
        cancelled = true;
        events.push("terminated");
      },
      stopRenderLoop: () => events.push("render-stop"),
      markPageUnloading: () => events.push("unloading"),
      takeConstructionRollback: () => null,
      takeDynamicSession: () => Object.freeze({
        disposeSynchronously: () => events.push("dynamic-dispose")
      }),
      disposeApplicationUi: () => events.push("ui-dispose"),
      takeStaticResources: () => Object.freeze({
        cancelSessionConstructionSynchronously: () => events.push("static-cancel"),
        dispose: () => events.push("static-dispose")
      }),
      disposeAmbientLight: () => events.push("light-dispose"),
      disposeScene: () => events.push("scene-dispose"),
      disposeEngine: () => events.push("engine-dispose")
    });
    target.dispatchEvent(new Event("beforeunload"));
    delayedVisual.resolve(Object.freeze({
      dispose: () => {
        disposeCount += 1;
      }
    }));
    await initialization.catch(() => null);
    assert(disposeCount === 1, `遅延visualの破棄回数が不正です: ${disposeCount}`);
    assert(
      events.indexOf("dynamic-dispose") < events.indexOf("static-dispose") &&
        events.indexOf("static-dispose") < events.indexOf("scene-dispose") &&
        events.indexOf("scene-dispose") < events.indexOf("engine-dispose"),
      `production終了coordinatorの順序が不正です: ${events.join(" | ")}`
    );
    return "production helper: 遅延visual破棄、dynamic→static→Scene→Engine";
  }),
  await executeTest("失敗後手動再試行のsnapshot・seed規則", () => {
    let currentSettings = V2_DEFAULT_TITLE_SETTINGS;
    const createCurrent = (_seed: number) => createV2SessionStartSnapshot({
      startMode: "normal",
      settings: currentSettings,
      venueRandom: () => 0
    });
    const failed = Object.freeze({ seed: 11, snapshot: createCurrent(11) });
    let nextSeedCalls = 0;
    const nextSeed = () => {
      nextSeedCalls += 1;
      return 12;
    };
    const unchanged = selectV2FailedSessionRetryRequest(
      failed,
      createCurrent,
      nextSeed
    );
    assert(
      unchanged.seed === failed.seed && unchanged.snapshot === failed.snapshot,
      "設定変更なしの再試行が失敗要求を維持しません。"
    );
    assert(nextSeedCalls === 0, "設定変更なしで新seedを消費しました。");
    currentSettings = Object.freeze({
      ...V2_DEFAULT_TITLE_SETTINGS,
      population: Object.freeze({
        ...V2_DEFAULT_TITLE_SETTINGS.population,
        npcCount: V2_DEFAULT_TITLE_SETTINGS.population.npcCount - 1
      })
    });
    const changed = selectV2FailedSessionRetryRequest(
      failed,
      createCurrent,
      nextSeed
    );
    assert(
      changed.seed !== failed.seed && changed.snapshot !== failed.snapshot,
      "設定変更ありの再試行が現在設定＋新seedになりません。"
    );
    return "自動再試行なし、明示click、未変更=同要求、変更=新要求";
  }),
  await executeTest("作者Location静的定義とsession binding分離", async () => {
    const checks = await runLocationAssetRegistryAcceptance();
    const failed = checks.filter((check) => !check.ok);
    assert(
      failed.length === 0,
      `Location作者定義検証が失敗しました: ${failed.map((check) => `${check.name}:${check.detail}`).join(" | ")}`
    );
    return `作者関係をcreate時検証、session query/NavMesh binding、${checks.length} checks`;
  }),
  await executeTest("Character visual部分構築失敗のtransaction rollback", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const directory = V2_PORTRAIT_ASSET_CATALOG.directories[0] ?? "fixture-portrait";
    const assignments = Object.freeze([Object.freeze({
      actorId: "player",
      voiceProfileId: "01",
      portraitDirectory: directory
    })]);
    const count = () => `${scene.meshes.length}/${scene.materials.length}/${scene.textures.length}`;
    const baseline = count();
    try {
      await createV2CharacterVisualRuntime({
        scene,
        assignments,
        orientationMode: "upright",
        showGroundShadows: true,
        includeNoGunTouchBlendFrames: false
      }, {
        resolvePortraitFiles: () => Object.freeze({}) as never,
        createPortraitSheet: async () => {
          throw new Error("fixture portrait decode failure");
        },
        createPresentationMaterial: () => {
          throw new Error("unexpected presentation factory");
        },
        revokeObjectUrl: (url) => URL.revokeObjectURL(url)
      }).catch(() => null);
      assert(count() === baseline, `portrait失敗後のScene baseline不一致: ${baseline} -> ${count()}`);

      const blobUrl = URL.createObjectURL(new Blob([new Uint8Array([0])]));
      let revoked = 0;
      await createV2CharacterVisualRuntime({
          scene,
          assignments,
          orientationMode: "upright",
          showGroundShadows: true,
          includeNoGunTouchBlendFrames: false
        }, {
          resolvePortraitFiles: () => Object.freeze({}) as never,
          createPortraitSheet: async () => Object.freeze({
            url: blobUrl,
            blobUrl,
            cellWidth: 1,
            cellHeight: 1,
            frameCount: 1,
            width: 1,
            height: 1,
            source: "portrait" as const
          }),
          createPresentationMaterial: () => {
            throw new Error("fixture presentation material failure");
          },
          revokeObjectUrl: (url) => {
            if (url === blobUrl) {
              revoked += 1;
            }
            URL.revokeObjectURL(url);
          }
      }).catch(() => null);
      assert(count() === baseline, `material失敗後のScene baseline不一致: ${baseline} -> ${count()}`);
      assert(revoked === 1, `blob URL revoke回数が不正です: ${revoked}`);

      return "portrait decode/material生成失敗でScene baseline復帰、blob URL残留0";
    } finally {
      scene.dispose();
      engine.dispose();
    }
  }),
  await executeTest("production Runtime transition／EventScope cleanup", async () => {
    const checks = await runRuntimeSessionLifecycleTests();
    const failed = checks.filter((check) => !check.ok);
    assert(
      failed.length === 0,
      `Runtime lifecycle検証が失敗しました: ${failed.map((check) => check.detail).join(" | ")}`
    );
    return `production transition/EventScope ${checks.length} checks`;
  }),
  await executeTest("実学校owner境界と3周session交換", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const beforeOwnership = getStageSpatialOwnershipDiagnostics();
    const owner = await loadStageStaticSpatialResources(scene, SCHOOL_STAGE);
    const staticIdentity = owner.view.resources.assetContainer;
    const dynamicIdentities = [];
    let ownerDisposed = false;
    try {
      for (let cycle = 0; cycle < 3; cycle += 1) {
        const session = await createStageSpatialSession(owner, {
          roomVariantSelections: createSchoolRoomVariantSelections(
            createSchoolRuntimeSettings(cycle % 2),
            0x606d + cycle
          ),
          dynamicSpatialInitialization:
            createSchoolStageDynamicSpatialInitializationDescriptor(0x606d + cycle)
        });
        dynamicIdentities.push(session.dynamicVariants);
        assert(
          session.staticView.resources.assetContainer === staticIdentity,
          "実学校の静的AssetContainer identityが変化しました。"
        );
        assert(
          !("dispose" in session.staticView) && !("sessionOwnership" in session.staticView),
          "非所有static viewへ所有APIが公開されています。"
        );
        let concurrentRejected = false;
        try {
          await createStageSpatialSession(owner, {
            roomVariantSelections: createSchoolRoomVariantSelections(
              createSchoolRuntimeSettings(0),
              1
            ),
            dynamicSpatialInitialization:
              createSchoolStageDynamicSpatialInitializationDescriptor(1)
          });
        } catch {
          concurrentRejected = true;
        }
        assert(concurrentRejected, "同じstatic ownerの同時sessionが拒否されませんでした。");
        if (cycle === 0) {
          const secondIndicator = session.elevatorAssets.all[0]!.stops[1]!.callIndicator.baseMesh;
          const authoredMaterial = secondIndicator.material;
          const invalidMaterial = new StandardMaterial("T06_6D_InvalidIndicator", scene);
          secondIndicator.material = invalidMaterial;
          const materialBaseline = scene.materials.length;
          let rejected = false;
          try {
            createSchoolStageInitialActiveSet({
              staticActiveSet: session.staticSpatialActiveSet,
              doorAssets: session.doorAssets,
              elevatorAssets: session.elevatorAssets,
              doorInitialRandom: () => 0
            });
          } catch {
            rejected = true;
          } finally {
            secondIndicator.material = authoredMaterial;
          }
          assert(rejected, "後続indicator不正によるinput生成失敗が拒否されませんでした。");
          assert(
            scene.materials.length === materialBaseline,
            "Elevator input部分構築失敗後にPBRMaterialが残留しました。"
          );
          invalidMaterial.dispose();
        }
        session.dispose();
        const afterSessionDispose = getStageSpatialOwnershipDiagnostics();
        assert(
          afterSessionDispose.sessionHumanNavigationWorldOwnerCount ===
            beforeOwnership.sessionHumanNavigationWorldOwnerCount,
          "実session破棄後にhuman NavigationWorldが残留しました。"
        );
      }
      assert(new Set(dynamicIdentities).size === 3, "実学校の動的identityが更新されませんでした。");
      owner.dispose();
      ownerDisposed = true;
      const afterOwnerDispose = getStageSpatialOwnershipDiagnostics();
      assert(
        afterOwnerDispose.glbParseCount === beforeOwnership.glbParseCount + 1 &&
          afterOwnerDispose.staticDecodedHumanBundleOwnerCount ===
            beforeOwnership.staticDecodedHumanBundleOwnerCount &&
          afterOwnerDispose.staticBitNavigationOwnerCount ===
            beforeOwnership.staticBitNavigationOwnerCount,
        "実loader/WASM owner counterがstatic破棄後baselineへ戻りません。"
      );
      let disposedOwnerRejected = false;
      try {
        await createStageSpatialSession(owner, {
          roomVariantSelections: createSchoolRoomVariantSelections(
            createSchoolRuntimeSettings(0),
            2
          ),
          dynamicSpatialInitialization:
            createSchoolStageDynamicSpatialInitializationDescriptor(2)
        });
      } catch {
        disposedOwnerRejected = true;
      }
      assert(disposedOwnerRejected, "破棄済みstatic ownerからsessionを生成できました。");
      return "AssetContainer identity不変、動的identity 3、同時／破棄後create拒否";
    } finally {
      if (!ownerDisposed) {
        owner.cancelSessionConstructionSynchronously();
        owner.dispose();
      }
      scene.dispose();
      engine.dispose();
    }
  })
];
