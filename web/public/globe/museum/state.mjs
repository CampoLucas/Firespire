export const Stage = Object.freeze({
  globe: "globe", approach: "approach", intro: "intro", entering: "entering",
  board: "board", travel: "travel", evidence: "evidence", returning: "returning",
});

/** @returns {import("./contracts").MuseumState} */
export const initial = () => ({ stage: Stage.globe, session: 0, motion: 0, target: null });

/**
 * @param {import("./contracts").MuseumState} state
 * @param {import("./contracts").MuseumEvent} event
 * @param {string[]} [ids]
 * @returns {import("./contracts").MuseumState}
 */
export function reduce(state, event, ids = []) {
  const { stage, session, motion } = state;
  if ((event.session != null && session !== event.session) ||
      (event.motion != null && motion !== event.motion)) return state;
  switch (event.type) {
    case "select":
      if (stage !== Stage.globe) return state;
      return { stage: Stage.approach, session: session + 1, motion: 1, target: null };
    case "arrived":
      return stage === Stage.approach ? { ...state, stage: Stage.intro } : state;
    case "start":
      return [Stage.approach, Stage.intro].some((candidate) => stage === candidate)
        ? { ...state, stage: Stage.entering, motion: motion + 1 } : state;
    case "board":
      return stage === Stage.entering ? { ...state, stage: Stage.board } : state;
    case "focus":
      if (![Stage.board, Stage.travel, Stage.evidence].some((candidate) => stage === candidate) ||
          (event.id != null && !ids.includes(event.id)) || state.target === (event.id ?? null)) return state;
      return { ...state, stage: Stage.travel, motion: motion + 1, target: event.id ?? null };
    case "settle":
      return stage === Stage.travel
        ? { ...state, stage: state.target == null ? Stage.board : Stage.evidence } : state;
    case "exit":
      return [Stage.globe, Stage.returning].some((candidate) => stage === candidate) ? state
        : { ...state, stage: Stage.returning, motion: motion + 1 };
    case "restored":
      return stage === Stage.returning ? { stage: Stage.globe, session, motion, target: null } : state;
    default:
      return state;
  }
}
