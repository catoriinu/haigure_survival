// 通信中断と素材エラーを分ける観測。再生・停止・音量・例外の扱いは変えない。
export function installMediaObservation() {
  const observation = { assignments: [], replacements: [], events: [] };
  window.__t07MediaObservation = observation;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
  const states = new WeakMap();
  let nextElementId = 1;
  let sequence = 0;
  Object.defineProperty(HTMLMediaElement.prototype, "src", {
    ...descriptor,
    set(value) {
      if (!states.has(this)) {
        states.set(this, { elementId: nextElementId++, assignedAt: null, assignmentId: null });
        for (const type of ["abort", "error", "canplaythrough"]) {
          this.addEventListener(type, () => observation.events.push({
            at: Date.now(), type, elementId: states.get(this).elementId, src: this.currentSrc || this.src,
            assignmentId: states.get(this).assignmentId, duration: this.duration,
            bufferedEnd: this.buffered.length === 0 ? 0 : this.buffered.end(this.buffered.length - 1),
            bufferedRanges: Array.from({ length: this.buffered.length }, (_, index) =>
              [this.buffered.start(index), this.buffered.end(index)]),
            errorCode: this.error?.code ?? null, networkState: this.networkState
          }));
        }
      }
      const state = states.get(this);
      const previousSrc = descriptor.get.call(this);
      if (previousSrc !== "") {
        observation.replacements.push({ at: Date.now(), elementId: state.elementId,
          previousAssignmentId: state.assignmentId,
          previousAssignedAt: state.assignedAt, previousSrc, previousCurrentSrc: this.currentSrc,
          nextSrc: new URL(String(value), location.href).href });
      }
      state.assignedAt = Date.now();
      state.assignmentId = sequence++;
      observation.assignments.push({ at: state.assignedAt, assignmentId: state.assignmentId,
        elementId: state.elementId, src: new URL(String(value), location.href).href });
      descriptor.set.call(this, value);
    }
  });
}

export const classifyMediaRequestFailures = (failures, observation) => failures.map((failure) => {
  const matches = failure.resourceType === "media" && failure.failure?.errorText === "net::ERR_ABORTED" &&
    failure.requestStartedAt > 0
    ? observation.replacements.filter((entry) => entry.previousSrc === failure.url &&
      entry.previousAssignedAt !== null && entry.previousAssignedAt <= failure.requestStartedAt + 1 &&
      failure.requestStartedAt <= entry.at && entry.at <= failure.at && failure.at - entry.at <= 1000)
    : [];
  const replacement = matches.length === 1 ? matches[0] : undefined;
  const mediaError = observation.events.some((entry) => entry.type === "error" && entry.src === failure.url);
  const assignments = failure.resourceType === "media" && failure.failure?.errorText === "net::ERR_ABORTED"
    ? observation.assignments.filter((entry) => entry.src === failure.url &&
      entry.at <= failure.requestStartedAt + 1 && failure.requestStartedAt - entry.at <= 100)
    : [];
  const buffered = assignments.length > 0 && assignments.every((assignment) => observation.events.some((entry) =>
    entry.assignmentId === assignment.assignmentId && entry.type === "canplaythrough" && entry.src === failure.url &&
    entry.at >= assignment.at && entry.at <= failure.at + 1000 && Number.isFinite(entry.duration) && entry.duration > 0 &&
    entry.bufferedRanges.length === 1 && entry.bufferedRanges[0][0] <= 0.000001 &&
    entry.bufferedRanges[0][1] >= entry.duration - 0.000001 && entry.errorCode === null));
  return { ...failure, classification: mediaError ? "unresolved-resource-failure" :
    replacement !== undefined ? "observed-media-source-replacement" :
      buffered ? "observed-complete-media-buffer" : "unresolved-resource-failure",
    matchedReplacement: replacement ?? null, replacementCandidateCount: matches.length,
    assignmentCandidateCount: assignments.length, completeBufferObserved: buffered };
});
