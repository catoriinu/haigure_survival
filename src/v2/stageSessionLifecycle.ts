interface StageStaticResourceSlotValue {
  readonly fingerprint: string;
  dispose(): void;
}

export const assertV2RuntimeConstructionActive = (
  isCancelled: () => boolean
) => {
  if (isCancelled()) {
    throw new Error("V2 Runtime sessionの構築中にアプリケーションが終了しました。");
  }
};

export const replaceV2StageStaticResourceSlot = async <
  TStatic extends StageStaticResourceSlotValue
>(
  slot: Readonly<{
    get(): TStatic | null;
    set(value: TStatic | null): void;
  }>,
  fingerprint: string,
  loadStatic: (fingerprint: string) => Promise<TStatic>,
  isCancelled: () => boolean
): Promise<TStatic> => {
  if (isCancelled()) {
    throw new Error("終了済みのStage静的資源は取得できません。");
  }
  const current = slot.get();
  if (current !== null && current.fingerprint === fingerprint) {
    return current;
  }
  current?.dispose();
  slot.set(null);
  const loaded = await loadStatic(fingerprint);
  if (isCancelled()) {
    loaded.dispose();
    throw new Error("Stage静的資源の読込中に構築が終了しました。");
  }
  if (loaded.fingerprint !== fingerprint) {
    loaded.dispose();
    throw new Error(
      `読込済み静的資源のfingerprintが要求と一致しません: ${loaded.fingerprint}`
    );
  }
  slot.set(loaded);
  return loaded;
};
