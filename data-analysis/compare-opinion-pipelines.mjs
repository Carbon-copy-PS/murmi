// Synthetic diagnostic only. No session data or participant identities are read.
// Run from the repository root: node data-analysis/compare-opinion-pipelines.mjs
import { computeOpinionClusters } from "../frontend/src/utils/opinion-clusters.js";
import { computeOpinionLandscape, computeSharedOpinionAnalysis } from "../shared/opinion-analysis.mjs";

function compare(name, patterns) {
  const statements = patterns[0].map((_, index) => ({
    id: `statement-${index}`,
    text: `Synthetic statement ${index + 1}`,
    created_at: index,
  }));
  const voters = patterns.map((pattern, index) => ({
    key: `synthetic-participant-${index}`,
    votes: Object.fromEntries(pattern.flatMap((vote, index) => (
      vote === null ? [] : [[statements[index].id, vote]]
    ))),
  }));
  const source = {
    sessionId: name,
    statements,
    votes: voters.flatMap((voter) => Object.entries(voter.votes).map(([statement_id, vote]) => ({
      participant_id: voter.key,
      statement_id,
      vote,
    }))),
  };
  const calculated = computeSharedOpinionAnalysis(source);
  const live = computeOpinionClusters({opinionAnalysis: calculated.live, voters});
  const report = computeOpinionLandscape(source);
  return {
    fixture: name,
    synthetic: true,
    live: { voters: live.voterCount, groups: live.k, groupSizes: live.clusters.map((group) => group.size) },
    report: {
      eligible: report.eligibleParticipants,
      excluded: report.excludedParticipants,
      groups: report.groups.length,
      groupSizes: report.groups.map((group) => group.size),
      status: report.status,
    },
  };
}

console.log(JSON.stringify([
  compare("small-third-pattern", Array.from({ length: 30 }, (_, participant) => (
    Array.from({ length: 12 }, (_, statement) => {
      if (participant < 14) return statement < 6 ? "agree" : "disagree";
      if (participant < 28) return statement < 6 ? "disagree" : "agree";
      return statement % 2 === 0 ? "agree" : "disagree";
    })
  ))),
  compare("sparse-likert", [
    ["strongly_agree", "strongly_agree"],
    ["strongly_agree", "strongly_agree"],
    ["agree", "agree"],
    ["agree", "strongly_agree"],
    ["strongly_agree", "neutral"],
    ["strongly_agree", "neutral"],
    ["neutral", "neutral"],
    ["agree", null],
  ]),
], null, 2));
