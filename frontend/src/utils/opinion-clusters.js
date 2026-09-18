// Membership is calculated once on the server. The viewer only adds their marker.
export function computeOpinionClusters({ opinionAnalysis, voters = [] }) {
  if (!opinionAnalysis) return null
  const youKey = voters.find((voter) => voter.isYou)?.key
  const points = (opinionAnalysis.points || []).map((point) => ({ ...point, isYou: point.key === youKey }))
  return {
    ...opinionAnalysis,
    points,
    youCluster: points.find((point) => point.isYou)?.cluster ?? null,
  }
}
