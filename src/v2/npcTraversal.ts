import {
  cloneNavigationLocation,
  type NavigationLocation
} from "../world/navigationWorld";
import type { StageLinkEndpointName } from "../world/stageLinks";

export type V2NpcElevatorTraversalIdentity = Readonly<{
  linkId: string;
  from: StageLinkEndpointName;
  to: StageLinkEndpointName;
}>;

export type V2NpcElevatorTraversalRoute =
  V2NpcElevatorTraversalIdentity &
    Readonly<{
      entryLocation: NavigationLocation;
      exitLocation: NavigationLocation;
    }>;

export type V2NpcTraversalState =
  | Readonly<{
      kind: "walking";
    }>
  | Readonly<{
      kind: "waiting-door-open";
      doorId: string;
    }>
  | Readonly<{
      kind: "passing-door";
      doorId: string;
    }>
  | (Readonly<{
      kind: "waiting-elevator-call-input";
    }> &
      V2NpcElevatorTraversalRoute)
  | (Readonly<{
      kind: "waiting-elevator-call";
    }> &
      V2NpcElevatorTraversalRoute)
  | (Readonly<{
      kind: "moving-to-elevator-wait";
    }> &
      V2NpcElevatorTraversalRoute)
  | (Readonly<{
      kind: "approaching-elevator-board";
    }> &
      V2NpcElevatorTraversalRoute)
  | (Readonly<{
      kind: "waiting-elevator-board";
    }> &
      V2NpcElevatorTraversalRoute)
  | (Readonly<{
      kind: "riding-elevator";
    }> &
      V2NpcElevatorTraversalRoute)
  | (Readonly<{
      kind: "leaving-elevator";
    }> &
      V2NpcElevatorTraversalRoute);

export type V2NpcTraversalRequest =
  | Readonly<{
      kind: "door-open";
      npcId: string;
      doorId: string;
    }>
  | Readonly<{
      kind: "door-pass-complete";
      npcId: string;
      doorId: string;
    }>
  | (Readonly<{
      kind: "elevator-call";
      npcId: string;
      requestedAtSeconds: number;
    }> &
      V2NpcElevatorTraversalRoute)
  | (Readonly<{
      kind: "elevator-call-cancel";
      npcId: string;
    }> &
      V2NpcElevatorTraversalRoute)
  | (Readonly<{
      kind: "elevator-reservation-cancel";
      npcId: string;
    }> &
      V2NpcElevatorTraversalRoute)
  | (Readonly<{
      kind: "elevator-board";
      npcId: string;
      requestedAtSeconds: number;
    }> &
      V2NpcElevatorTraversalRoute);

export type V2NpcTraversalResult =
  | Readonly<{
      kind: "door-opened";
      npcId: string;
      doorId: string;
    }>
  | Readonly<{
      kind: "door-pass-detected";
      npcId: string;
      doorId: string;
    }>
  | (Readonly<{
      kind: "elevator-call-accepted";
      npcId: string;
    }> &
      V2NpcElevatorTraversalIdentity)
  | (Readonly<{
      kind: "elevator-ready-for-boarding";
      npcId: string;
    }> &
      V2NpcElevatorTraversalIdentity)
  | (Readonly<{
      kind: "elevator-boarded";
      npcId: string;
    }> &
      V2NpcElevatorTraversalIdentity)
  | (Readonly<{
      kind: "elevator-safety-evicted";
      npcId: string;
      location: NavigationLocation;
    }> &
      V2NpcElevatorTraversalIdentity)
  | (Readonly<{
      kind: "elevator-boarding-rejected";
      npcId: string;
      reason: "capacity-reached" | "not-boardable";
    }> &
      V2NpcElevatorTraversalIdentity)
  | (Readonly<{
      kind: "elevator-arrived";
      npcId: string;
    }> &
      V2NpcElevatorTraversalIdentity)
  | (Readonly<{
      kind: "elevator-disembarked";
      npcId: string;
      location: NavigationLocation;
    }> &
      V2NpcElevatorTraversalIdentity);

export type V2NpcTraversalNotification = Readonly<{
  kind: "follow-cancelled";
  npcId: string;
  reason: "elevator-capacity-reached";
}>;

export const createWalkingV2NpcTraversalState =
  (): V2NpcTraversalState => Object.freeze({ kind: "walking" });

export const cloneV2NpcTraversalState = (
  state: V2NpcTraversalState
): V2NpcTraversalState =>
  isV2NpcElevatorTraversalState(state)
    ? Object.freeze({
        ...state,
        entryLocation: cloneNavigationLocation(state.entryLocation),
        exitLocation: cloneNavigationLocation(state.exitLocation)
      })
    : Object.freeze({ ...state });

export const isV2NpcTraversalWalkingEnabled = (
  state: V2NpcTraversalState
): boolean =>
  state.kind === "walking" ||
  state.kind === "passing-door" ||
  state.kind === "moving-to-elevator-wait" ||
  state.kind === "approaching-elevator-board";

export const isV2NpcElevatorTraversalState = (
  state: V2NpcTraversalState
): state is Extract<
  V2NpcTraversalState,
  {
    linkId: string;
  }
> => "linkId" in state;
