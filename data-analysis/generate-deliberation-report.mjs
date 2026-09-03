import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { analyzePolisInspiredSession } from "./polis-inspired-analysis.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPORTS_DIR = path.join(SCRIPT_DIR, "reports");
const VERSION = "1.14.0";

const VOTE_SCORE = {
  strongly_agree: 2,
  agree: 1,
  neutral: 0,
  disagree: -1,
  strongly_disagree: -2,
};

const TENSION_PAIR_INDEXES = [
  { leftIndex: 4, rightIndex: 0 },
  { leftIndex: 1, rightIndex: 13 },
  { leftIndex: 6, rightIndex: 21 },
];

const LOW_REACH_SHARE = 0.5;

const PALETTE = {
  background: "#FFFFFF",
  paper: "#FFFFFF",
  ink: "#161616",
  muted: "#60656A",
  grid: "#D7D9D9",
  agree: "#0E747E",
  agreeSoft: "#EAF2F2",
  neutral: "#CDD1D2",
  disagree: "#C85842",
  disagreeSoft: "#F5E8E4",
  violet: "#6E6598",
  violetSoft: "#EFEDF4",
  amber: "#A86D24",
  amberSoft: "#F4EEE5",
  green: "#557A55",
  greenSoft: "#EDF2EC",
  roseSoft: "#F3ECEE",
};

const FONT_STACK = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
const ACCENT_FONT_STACK = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
const EMBEDDED_FONT_CSS = "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeHtml(value) {
  return escapeXml(value);
}

function pct(value, digits = 1) {
  return Number(value).toFixed(digits).replace(/\.0$/, "") + "%";
}

function formatReportDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  assert(!Number.isNaN(date.getTime()), "Invalid report date.");
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatReportDateEnglish(value) {
  const date = value instanceof Date ? value : new Date(value);
  assert(!Number.isNaN(date.getTime()), "Invalid report date.");
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function wrapTraditionalChinese(text, maxCharacters) {
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    const characters = Array.from(paragraph);
    let current = "";
    for (const character of characters) {
      current += character;
      if (Array.from(current).length >= maxCharacters) {
        lines.push(current);
        current = "";
      }
    }
    if (current) lines.push(current);
  }
  const closingPunctuation = new Set(Array.from("，。、；：？！）」』》"));
  for (let index = 1; index < lines.length; index += 1) {
    const first = Array.from(lines[index])[0];
    if (closingPunctuation.has(first)) {
      lines[index - 1] += first;
      lines[index] = Array.from(lines[index]).slice(1).join("");
    }
  }
  return lines;
}

function wrapEnglish(text, maxCharacters) {
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? current + " " + word : word;
      if (current && candidate.length > maxCharacters) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function svgTextBlock({
  x,
  y,
  text,
  maxCharacters,
  className = "body",
  anchor = "start",
  lineGap = 30,
  wrap = wrapTraditionalChinese,
}) {
  const lines = wrap(text, maxCharacters);
  return lines.map((line, index) => (
    '<text x="' + x + '" y="' + (y + index * lineGap) + '" text-anchor="' + anchor +
    '" class="' + className + '">' + escapeXml(line) + "</text>"
  )).join("");
}

function svgStart({ id, width, height, title, description, language = "zh-Hant-TW" }) {
  assert(/^[a-z0-9-]+$/.test(id), "SVG accessibility id must be lowercase ASCII.");
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
      '" viewBox="0 0 ' + width + " " + height +
      '" class="htr-chart" role="img" lang="' + language + '" xml:lang="' + language +
      '" aria-labelledby="' + id + '-title ' + id + '-desc">',
    '<title id="' + id + '-title">' + escapeXml(title) + "</title>",
    '<desc id="' + id + '-desc">' + escapeXml(description) + "</desc>",
    "<style>",
    EMBEDDED_FONT_CSS,
    ".htr-chart text{font-family:" + FONT_STACK + ";fill:" + PALETTE.ink + ";font-weight:400}",
    ".htr-chart .title{font-family:" + ACCENT_FONT_STACK + ";font-size:44px;font-weight:400;letter-spacing:-.5px}",
    ".htr-chart .subtitle{font-size:22px;fill:" + PALETTE.muted + "}",
    ".htr-chart .section{font-size:26px;font-weight:500}",
    ".htr-chart .body{font-size:22px}",
    ".htr-chart .compact{font-size:19px}",
    ".htr-chart .small{font-size:18px;fill:" + PALETTE.muted + "}",
    ".htr-chart .tiny{font-size:16px;fill:" + PALETTE.muted + "}",
    ".htr-chart .value{font-size:20px;font-weight:500}",
    ".htr-chart .label{font-size:20px;font-weight:500}",
    ".htr-chart .point-number{font-size:12px;font-weight:500;fill:" + PALETTE.ink + ";pointer-events:none}",
    ".htr-chart .grid{stroke:" + PALETTE.grid + ";stroke-width:1}",
    ".htr-chart .axis{stroke:" + PALETTE.muted + ";stroke-width:1.5}",
    ".htr-chart .callout{font-weight:500}",
    "</style>",
    '<rect width="' + width + '" height="' + height + '" fill="' + PALETTE.background + '"/>',
  ];
}

function svgHeader(parts, title, subtitle) {
  parts.push('<g class="chart-title">');
  parts.push('<text x="72" y="72" class="title">' + escapeXml(title) + "</text>");
  parts.push('<text x="72" y="112" class="subtitle">' + escapeXml(subtitle) + "</text>");
  parts.push('</g>');
}

function flattenSvg(svg) {
  return svg.replace(/\srx="[^"]+"/g, ' rx="0"');
}

function buildEmbeddedSvg(svg, cropTop = 116) {
  const root = svg.match(/^<svg[^>]*\bwidth="(\d+)"\s+height="(\d+)"\s+viewBox="0 0 (\d+) (\d+)"/);
  assert(root, "Unable to read SVG dimensions for embedded chart.");
  const width = Number(root[1]);
  const height = Number(root[2]);
  const croppedHeight = height - cropTop;
  assert(width === Number(root[3]) && height === Number(root[4]) && croppedHeight > 0, "Invalid SVG crop dimensions.");
  return svg
    .replace(/<g class="chart-title">[\s\S]*?<\/g>/, "")
    .replace(
      'width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"',
      'width="' + width + '" height="' + croppedHeight + '" viewBox="0 ' + cropTop + ' ' + width + ' ' + croppedHeight + '"',
    );
}

function scale(value, domainMin, domainMax, rangeMin, rangeMax) {
  return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
}

function isSupportVote(value) {
  return value === "strongly_agree" || value === "agree";
}

function computeTensionOverlaps(raw, statements) {
  const votesByParticipant = new Map();
  for (const vote of raw.votes) {
    const participantId = String(vote.participant_id);
    if (!votesByParticipant.has(participantId)) votesByParticipant.set(participantId, new Map());
    votesByParticipant.get(participantId).set(String(vote.statement_id), vote.vote);
  }

  return TENSION_PAIR_INDEXES.map(({ leftIndex, rightIndex }) => {
    const leftStatementId = String(statements[leftIndex].id);
    const rightStatementId = String(statements[rightIndex].id);
    const counts = { both: 0, leftOnly: 0, rightOnly: 0, neither: 0 };
    let jointN = 0;

    for (const participantVotes of votesByParticipant.values()) {
      const leftVote = participantVotes.get(leftStatementId);
      const rightVote = participantVotes.get(rightStatementId);
      if (leftVote == null || rightVote == null) continue;
      jointN += 1;
      const leftSupport = isSupportVote(leftVote);
      const rightSupport = isSupportVote(rightVote);
      if (leftSupport && rightSupport) counts.both += 1;
      else if (leftSupport) counts.leftOnly += 1;
      else if (rightSupport) counts.rightOnly += 1;
      else counts.neither += 1;
    }

    assert(Object.values(counts).reduce((sum, value) => sum + value, 0) === jointN, "Tension overlap counts do not reconcile.");
    return {
      leftIndex,
      rightIndex,
      jointN,
      counts,
      percentages: Object.fromEntries(
        Object.entries(counts).map(([key, value]) => [key, jointN ? 100 * value / jointN : 0]),
      ),
    };
  });
}

function computeMetrics(raw) {
  assert(raw && raw.session && Array.isArray(raw.statements) && Array.isArray(raw.votes), "Invalid HearTheRoom raw export.");
  const sessionId = String(raw.session.id || "").trim();
  assert(sessionId, "Missing session id.");
  const statements = [...raw.statements].sort((left, right) => {
    const timeDifference = Number(left.created_at) - Number(right.created_at);
    if (timeDifference !== 0) return timeDifference;
    return String(left.id).localeCompare(String(right.id));
  });
  const voterIds = [...new Set(raw.votes.map((vote) => String(vote.participant_id)))].sort();
  const votesByStatement = new Map(statements.map((statement) => [String(statement.id), []]));
  const pairKeys = new Set();

  for (const vote of raw.votes) {
    assert(String(vote.session_id) === sessionId, "Mixed-session vote found.");
    assert(Object.hasOwn(VOTE_SCORE, vote.vote), "Unknown vote value: " + vote.vote);
    const pairKey = String(vote.participant_id) + "\u0000" + String(vote.statement_id);
    assert(!pairKeys.has(pairKey), "Duplicate participant/statement pair.");
    pairKeys.add(pairKey);
    const target = votesByStatement.get(String(vote.statement_id));
    assert(target, "Vote references unknown statement.");
    target.push(vote);
  }

  const metrics = statements.map((statement, index) => {
    const votes = votesByStatement.get(String(statement.id));
    const counts = {
      strongly_agree: 0,
      agree: 0,
      neutral: 0,
      disagree: 0,
      strongly_disagree: 0,
    };
    for (const vote of votes) counts[vote.vote] += 1;
    const support = counts.strongly_agree + counts.agree;
    const oppose = counts.disagree + counts.strongly_disagree;
    const n = votes.length;
    return {
      index,
      statementId: String(statement.id),
      text: statement.text,
      n,
      support,
      neutral: counts.neutral,
      oppose,
      stronglyAgree: counts.strongly_agree,
      agree: counts.agree,
      disagree: counts.disagree,
      stronglyDisagree: counts.strongly_disagree,
      supportPct: 100 * support / n,
      neutralPct: 100 * counts.neutral / n,
      opposePct: 100 * oppose / n,
      coveragePct: 100 * n / voterIds.length,
      mean: votes.reduce((sum, vote) => sum + VOTE_SCORE[vote.vote], 0) / n,
    };
  });

  const totals = metrics.reduce((result, metric) => ({
    responses: result.responses + metric.n,
    support: result.support + metric.support,
    neutral: result.neutral + metric.neutral,
    oppose: result.oppose + metric.oppose,
  }), { responses: 0, support: 0, neutral: 0, oppose: 0 });

  assert(statements.length === 24, "Expected 24 statements.");
  assert(voterIds.length === 71, "Expected 71 voting participants.");
  assert(totals.responses === 1028, "Expected 1,028 final responses.");
  assert(totals.support === 785 && totals.neutral === 159 && totals.oppose === 84, "Aggregate vote totals do not reconcile.");

  const tensionOverlaps = computeTensionOverlaps(raw, statements);
  return { sessionId, statements, voterCount: voterIds.length, metrics, totals, tensionOverlaps };
}

function buildReportSafeOpinionTendencies(result) {
  const source = result.opinionTendencies;
  if (!source || source.tendencyCount !== 3 || !Array.isArray(source.profiles)) {
    return {
      available: false,
      profiles: [],
      overlapSummary: null,
      mapDomain: null,
    };
  }
  const supportRate = (profile, statementIndex) => (
    profile.statements.find((statement) => statement.statementIndex === statementIndex)?.supportRateDecided ?? null
  );
  const prevention = [...source.profiles].sort((left, right) => (
    (supportRate(left, 0) ?? 0.5) - (supportRate(right, 0) ?? 0.5)
  ))[0];
  const remainingAfterPrevention = source.profiles.filter((profile) => profile !== prevention);
  const adaptiveScore = (profile) => {
    const values = [
      supportRate(profile, 6),
      supportRate(profile, 8),
      supportRate(profile, 10),
      supportRate(profile, 21),
    ].filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  };
  const adaptive = [...remainingAfterPrevention].sort((left, right) => (
    adaptiveScore(right) - adaptiveScore(left)
  ))[0];
  const care = remainingAfterPrevention.find((profile) => profile !== adaptive);
  const definitions = [
    { key: "care", profile: care, priorityIndexes: [0, 11] },
    { key: "prevention", profile: prevention, priorityIndexes: [4, 16] },
    { key: "adaptive", profile: adaptive, priorityIndexes: [6, 10] },
  ];
  const profiles = definitions.map(({ key, profile, priorityIndexes }) => {
    assert(profile, "Could not assign an opinion-tendency profile.");
    const priorities = priorityIndexes.map((statementIndex) => ({
      statementIndex,
      supportRate: supportRate(profile, statementIndex),
    }));
    assert(priorities.every((priority) => Number.isFinite(priority.supportRate)), "Opinion-tendency priority is missing a support rate.");
    return {
      key,
      centroid: profile.centroid.map((value) => Number(value)),
      spread: {
        varianceX: Number(profile.spread.varianceX),
        covarianceXY: Number(profile.spread.covarianceXY),
        varianceY: Number(profile.spread.varianceY),
      },
      membershipMass: Number(profile.membershipMass),
      priorities,
    };
  });
  assert(profiles.every((profile) => (
    profile.centroid.length === 2
    && profile.centroid.every(Number.isFinite)
    && Object.values(profile.spread).every(Number.isFinite)
    && Number.isFinite(profile.membershipMass)
  )), "Opinion-tendency geometry is invalid.");
  return {
    available: true,
    method: source.method,
    tendencyCount: source.tendencyCount,
    fuzzifier: source.fuzzifier,
    profiles,
    mapDomain: Object.fromEntries(
      Object.entries(source.mapDomain).map(([key, value]) => [key, Number(value)]),
    ),
    overlapSummary: {
      membershipThreshold: Number(source.overlapSummary.membershipThreshold),
      participantsWithMultipleTendencies: Number(source.overlapSummary.participantsWithMultipleTendencies),
      eligibleParticipants: Number(source.overlapSummary.eligibleParticipants),
    },
  };
}

function buildReportSafeGroupAnalysis(result) {
  const diagnostics = result.diagnostics || {};
  const guardrails = diagnostics.publicationGuardrails;
  const status = !result.ok
    ? "unavailable"
    : guardrails?.pass
      ? "publishable"
      : "withheld";
  const stability = diagnostics.statementBootstrapStability || {};
  const stabilityCheck = guardrails?.checks?.statementBootstrapMedianAdjustedRand;
  const groupSizes = diagnostics.clustering?.groupSizes || result.groups?.map((group) => group.size) || [];
  const sensitivity = (diagnostics.eligibilitySensitivity || []).map((entry) => ({
    minimumVotes: entry.minimumVotes,
    eligibleParticipants: entry.eligibleParticipantCount,
    selectedK: entry.selectedK,
    silhouette: entry.silhouette,
    groupSizes: [...(entry.groupSizes || [])],
  }));
  const publicationChecks = Object.fromEntries(
    Object.entries(guardrails?.checks || {}).map(([key, check]) => [key, {
      threshold: check.threshold,
      observed: check.observed,
      pass: check.pass,
    }]),
  );
  const bootstrapRuns = (stability.records || []).map((record) => ({
    selectedK: record.selectedK,
    adjustedRand: record.adjustedRand,
  }));
  assert(bootstrapRuns.every((run) => Number.isInteger(run.selectedK) && run.selectedK >= 2 && run.selectedK <= 5 && Number.isFinite(run.adjustedRand)), "Invalid privacy-safe bootstrap record.");
  const bootstrapThreshold = stabilityCheck?.threshold ?? 0.70;
  const pcaDensity = buildPcaDensity(result.assignments || []);
  const pcaAxisVariancePct = (diagnostics.pca?.explainedVarianceRatio || [])
    .slice(0, 2)
    .map((value) => 100 * value);
  const opinionTendencies = buildReportSafeOpinionTendencies(result);

  return {
    status,
    method: diagnostics.method || "Pol.is-inspired static analysis; not official Pol.is output",
    totalParticipants: diagnostics.participantCount || 0,
    eligibleParticipants: diagnostics.eligibleParticipantCount || 0,
    excludedParticipants: diagnostics.excludedParticipantCount || 0,
    minimumVotes: diagnostics.eligibilityThreshold || 7,
    statementCount: diagnostics.statementCount || 0,
    selectedK: diagnostics.clustering?.selectedK ?? null,
    groupSizes: [...groupSizes],
    silhouette: diagnostics.clustering?.selectedSilhouette ?? null,
    explainedVariancePct: diagnostics.pca?.explainedVarianceRatioTotal == null
      ? null
      : 100 * diagnostics.pca.explainedVarianceRatioTotal,
    pcaAxisVariancePct,
    pcaDensity,
    opinionTendencies,
    bootstrapMedianAri: stability.adjustedRand?.median ?? null,
    bootstrapReplicates: stability.replicatesCompleted || 0,
    bootstrapSameKRate: stability.sameKRate ?? null,
    bootstrapPassCount: bootstrapRuns.filter((run) => run.adjustedRand >= bootstrapThreshold).length,
    bootstrapSelectedKFrequency: Object.fromEntries(
      Object.entries(stability.selectedKFrequency || {})
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([key, value]) => [String(key), value]),
    ),
    sensitivity,
    selectedKRange: diagnostics.observedSelectedKRange || { minimum: null, maximum: null },
    thresholds: {
      minGroupSize: guardrails?.checks?.minimumGroupSize?.threshold ?? 15,
      minGroupShare: guardrails?.checks?.minimumGroupShare?.threshold ?? 0.20,
      minSilhouette: guardrails?.checks?.silhouette?.threshold ?? 0.25,
      minBootstrapMedianAri: stabilityCheck?.threshold ?? 0.70,
    },
    publicationChecks,
    reason: result.reason || null,
  };
}

function buildPcaDensity(assignments, columns = 3, rows = 3, minimumCellCount = 5) {
  const points = assignments
    .map((assignment) => assignment.coordinates)
    .filter((coordinates) => Array.isArray(coordinates) && coordinates.length >= 2 &&
      Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1]));
  if (!points.length) {
    return {
      columns,
      rows,
      minimumCellCount,
      participantCount: 0,
      shownParticipants: 0,
      suppressedParticipants: 0,
      maximumCellCount: 0,
      domainAspectRatio: 1,
      cells: [],
    };
  }
  const xValues = points.map((point) => point[0]);
  const yValues = points.map((point) => point[1]);
  const xMinimum = Math.min(...xValues);
  const xMaximum = Math.max(...xValues);
  const yMinimum = Math.min(...yValues);
  const yMaximum = Math.max(...yValues);
  const xSpan = Math.max(Number.EPSILON, xMaximum - xMinimum);
  const ySpan = Math.max(Number.EPSILON, yMaximum - yMinimum);
  const counts = new Map();
  for (const [x, y] of points) {
    const column = Math.min(columns - 1, Math.floor(columns * (x - xMinimum) / xSpan));
    const rowFromBottom = Math.min(rows - 1, Math.floor(rows * (y - yMinimum) / ySpan));
    const row = rows - 1 - rowFromBottom;
    const key = row + "," + column;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const cells = [...counts.entries()]
    .map(([key, count]) => {
      const [row, column] = key.split(",").map(Number);
      return { row, column, count };
    })
    .filter((cell) => cell.count >= minimumCellCount)
    .sort((left, right) => left.row - right.row || left.column - right.column);
  const shownParticipants = cells.reduce((sum, cell) => sum + cell.count, 0);
  assert(cells.every((cell) => cell.count >= minimumCellCount), "PCA density privacy threshold failed.");
  return {
    columns,
    rows,
    minimumCellCount,
    participantCount: points.length,
    shownParticipants,
    suppressedParticipants: points.length - shownParticipants,
    maximumCellCount: Math.max(0, ...cells.map((cell) => cell.count)),
    domainAspectRatio: Number((xSpan / ySpan).toFixed(3)),
    cells,
  };
}

const SHORT_LABELS = [
  "被害人協助與救濟優先於限制 AI 影像生成",
  "年齡限制仍有助於建立使用界線",
  "兒少正式參與政策制定",
  "每年辦理親子 AI 安全教育",
  "上線前完成兒少影響評估",
  "依是否有明確被害人區分情境",
  "防止以兒少保護之名擴張監控",
  "儘速釐清 AI 對兒少的傷害樣態與可能性",
  "先促進社會對話與理解，再推動立法",
  "成長背景不同，難有單一標準",
  "教育優先於限制",
  "救濟比防範與執法更重要",
  "多數支持的主張彼此可能矛盾",
  "年齡不應是唯一標準",
  "對 AI 的理解會持續改變，政策也應定期檢討",
  "重視家庭教育，不只依賴政府介入",
  "建立明確技術標準",
  "情感教育與人際協作同樣重要",
  "邀請更多政府與企業代表參與討論",
  "透過教育凝聚共識，優於強制規範",
  "建立 AI 內容分級制度",
  "避免過度強調政治正確而壓縮創作自由",
  "使用 AI 生成內容前應先查證，兒少尤其需要協助",
  "法規能否跟上 AI 變化？",
];

const EN_SHORT_LABELS = [
  "Prioritise victim support over restricting generation",
  "Age restrictions still provide useful boundaries",
  "Formally involve children and young people in policymaking",
  "Provide annual parent–child AI safety education",
  "Complete child impact assessments before launch",
  "Treat cases with and without identifiable victims differently",
  "Prevent expanded surveillance in the name of child protection",
  "Urgently research specific AI harms to children and young people",
  "Build public understanding before taking legislative action",
  "No single standard fits people from different backgrounds",
  "Prioritise education over restrictions",
  "Redress matters more than prevention and enforcement",
  "Majority-supported positions may contradict one another",
  "Age should not be the only criterion",
  "Revise policy as understanding develops",
  "Prioritise family education, not government intervention alone",
  "Establish clear technical standards",
  "Emotional learning and interpersonal collaboration matter equally",
  "Involve more government and industry representatives",
  "Build shared understanding through education rather than compulsory rules",
  "Establish an AI content rating system",
  "Avoid letting political correctness constrain creative freedom",
  "Verify AI-generated content, with extra care for younger children",
  "Can regulation keep pace with AI?",
];

assert(SHORT_LABELS.length === 24 && EN_SHORT_LABELS.length === 24, "Both language editions require 24 aligned statement labels.");

function buildSupportCoverageSvg(metrics, language = "zh") {
  const english = language === "en";
  const copy = english ? {
    id: "support-coverage-en",
    title: "Support and response coverage",
    description: "Each numbered circle represents one statement. The horizontal axis shows support among respondents to that statement; the vertical axis shows coverage among all 71 voters. Circle size represents the neutral share.",
    heading: "Strongest evidence combines support and reach",
    subtitle: "Right = more support; higher = more responses; larger = more neutral.",
    xAxis: "Support among statement respondents",
    yAxis: "Response coverage among 71 voters",
    sizeLegend: "Circle size = neutral share",
    shortLabels: EN_SHORT_LABELS,
    tooltip: (metric) => EN_SHORT_LABELS[metric.index] +
      (EN_SHORT_LABELS[metric.index].endsWith("?") ? " Support " : ": support ") + pct(metric.supportPct) +
      ", neutral " + pct(metric.neutralPct) + ", oppose " + pct(metric.opposePct) + ", n=" + metric.n,
    labelConfig: {
      0: { dx: -16, dy: -18, anchor: "end", label: "Victim support first" },
      2: { dx: -16, dy: -18, anchor: "end", label: "Formal youth role" },
      3: { dx: 18, dy: 34, anchor: "start", label: "Parent–child AI safety" },
      6: { dx: -16, dy: -18, anchor: "end", label: "Anti-surveillance" },
      7: { dx: -18, dy: -18, anchor: "end", label: "Research concrete harms" },
      23: { dx: 20, dy: -18, anchor: "start", label: "Can rules keep pace?" },
    },
  } : {
    id: "support-coverage",
    title: "支持率與作答覆蓋率",
    description: "每個有題號的圓點代表一項陳述。橫軸是各題實際作答者中的支持率，縱軸是七十一位投票者中的作答覆蓋率，圓點大小代表中立比例。題號可對照報告中的二十四題清單。",
    heading: "穩固共識＝高支持＋高覆蓋",
    subtitle: "越右支持越高，越上作答越多；圓點越大，中立比例越高。",
    xAxis: "支持率（該題實際作答者）",
    yAxis: "作答覆蓋率（71 位投票者）",
    sizeLegend: "圓點大小＝中立比例",
    shortLabels: SHORT_LABELS,
    tooltip: (metric) => SHORT_LABELS[metric.index] + "：支持 " + pct(metric.supportPct) +
      "、中立 " + pct(metric.neutralPct) + "、反對 " + pct(metric.opposePct) + "，n=" + metric.n,
    labelConfig: {
      0: { dx: -16, dy: -18, anchor: "end", label: "被害人支持優先" },
      2: { dx: -16, dy: -18, anchor: "end", label: "兒少正式參與" },
      3: { dx: 18, dy: 34, anchor: "start", label: "親子 AI 安全教育" },
      6: { dx: -16, dy: -18, anchor: "end", label: "反監控保障" },
      7: { dx: 18, dy: -18, anchor: "start", label: "研究具體傷害" },
      23: { dx: 20, dy: -18, anchor: "start", label: "法規能否跟上？" },
    },
  };
  const width = 1440;
  const height = 900;
  const parts = svgStart({
    id: copy.id,
    language: english ? "en" : "zh-Hant-TW",
    width,
    height,
    title: copy.title,
    description: copy.description,
  });
  svgHeader(parts, copy.heading, copy.subtitle);

  const plot = { left: 150, right: 1320, top: 180, bottom: 760 };
  const x = (value) => scale(value, 35, 100, plot.left, plot.right);
  const y = (value) => scale(value, 25, 100, plot.bottom, plot.top);
  const radius = (value) => scale(value, 0, 45, 11, 23);

  [40, 50, 60, 70, 80, 90, 100].forEach((value) => {
    const xx = x(value);
    parts.push('<line x1="' + xx + '" x2="' + xx + '" y1="' + plot.top + '" y2="' + plot.bottom + '" class="grid"/>');
    parts.push('<text x="' + xx + '" y="' + (plot.bottom + 34) + '" text-anchor="middle" class="small">' + value + "%</text>");
  });
  [25, 50, 75, 100].forEach((value) => {
    const yy = y(value);
    parts.push('<line x1="' + plot.left + '" x2="' + plot.right + '" y1="' + yy + '" y2="' + yy + '" class="grid"/>');
    parts.push('<text x="' + (plot.left - 18) + '" y="' + (yy + 7) + '" text-anchor="end" class="small">' + value + "%</text>");
  });
  parts.push('<line x1="' + plot.left + '" x2="' + plot.right + '" y1="' + plot.bottom + '" y2="' + plot.bottom + '" class="axis"/>');
  parts.push('<line x1="' + plot.left + '" x2="' + plot.left + '" y1="' + plot.top + '" y2="' + plot.bottom + '" class="axis"/>');
  parts.push('<text x="' + ((plot.left + plot.right) / 2) + '" y="840" text-anchor="middle" class="body">' + escapeXml(copy.xAxis) + '</text>');
  parts.push('<text x="42" y="' + ((plot.top + plot.bottom) / 2) + '" text-anchor="middle" class="body" transform="rotate(-90 42 ' + ((plot.top + plot.bottom) / 2) + ')">' + escapeXml(copy.yAxis) + '</text>');

  const labelConfig = copy.labelConfig;

  metrics.forEach((metric) => {
    const xx = x(metric.supportPct);
    const yy = y(metric.coveragePct);
    const highlighted = Object.hasOwn(labelConfig, metric.index);
    parts.push("<g>");
    parts.push("<title>" + escapeXml(copy.tooltip(metric)) + "</title>");
    parts.push('<circle cx="' + xx + '" cy="' + yy + '" r="' + radius(metric.neutralPct) +
      '" fill="' + PALETTE.agree + '" fill-opacity="' + (highlighted ? 0.98 : 0.82) +
      '" stroke="' + (highlighted ? PALETTE.ink : PALETTE.paper) +
      '" stroke-width="' + (highlighted ? 3 : 1.5) + '"/>');
    parts.push('<text x="' + xx + '" y="' + (yy + 4) +
      '" text-anchor="middle" class="point-number">' + (metric.index + 1) + '</text>');
    parts.push("</g>");
    if (highlighted) {
      const config = labelConfig[metric.index];
      parts.push('<text x="' + (xx + config.dx) + '" y="' + (yy + config.dy) +
        '" text-anchor="' + config.anchor + '" class="label callout">' +
        escapeXml("#" + (metric.index + 1) + " " + config.label + (english ? " · " : "・") + Math.round(metric.supportPct) + "%") + "</text>");
    }
  });

  parts.push('<circle cx="970" cy="825" r="11" fill="' + PALETTE.agree + '" fill-opacity="0.82"/>');
  parts.push('<circle cx="1034" cy="825" r="17" fill="' + PALETTE.agree + '" fill-opacity="0.82"/>');
  parts.push('<circle cx="1110" cy="825" r="23" fill="' + PALETTE.agree + '" fill-opacity="0.82"/>');
  parts.push('<text x="1150" y="832" class="small">' + escapeXml(copy.sizeLegend) + '</text>');
  parts.push("</svg>");
  return parts.join("\n");
}

function buildKeyStatementsSvg(metrics, language = "zh") {
  const english = language === "en";
  const copy = english ? {
    id: "key-statements-en",
    title: "Five-point distribution for key statements",
    description: "Distribution of strongly agree, agree, neutral, disagree and strongly disagree responses across seven key statements and Q24, with the response count for each prompt.",
    heading: "Common ground is clear; Q24 needs to be rewritten",
    subtitle: "Bars show five-point responses among each prompt’s respondents; n appears at right.",
    legend: ["Strongly agree", "Agree", "Neutral", "Disagree", "Strongly disagree"],
    shortLabels: EN_SHORT_LABELS,
    note: "No ‘strongly disagree’ votes were recorded. Q24 is a question, so agreement cannot be read as support for a policy position.",
  } : {
    id: "key-statements",
    title: "關鍵題目的五點量表分布",
    description: "八題關鍵題目的非常同意、同意、中立、不同意與非常不同意百分比分布，並標示各題作答人數。",
    heading: "共同方向清楚；第 24 題需改寫後重問",
    subtitle: "色帶顯示各題作答者的五點回應；右側 n 為作答人數。",
    legend: ["非常同意", "同意", "中立", "不同意", "非常不同意"],
    shortLabels: SHORT_LABELS,
    note: "本次沒有任何「非常不同意」票。第 24 題是問句，同意／不同意不能直接解讀為政策支持／反對。",
  };
  const width = 1440;
  const height = 960;
  const parts = svgStart({
    id: copy.id,
    language: english ? "en" : "zh-Hant-TW",
    width,
    height,
    title: copy.title,
    description: copy.description,
  });
  svgHeader(parts, copy.heading, copy.subtitle);

  const legend = [
    [copy.legend[0], "#0D5C63"],
    [copy.legend[1], "#45A0A8"],
    [copy.legend[2], PALETTE.neutral],
    [copy.legend[3], PALETTE.disagree],
    [copy.legend[4], "#8C3B2A"],
  ];
  let legendX = english ? 390 : 490;
  const englishLegendGaps = [205, 135, 145, 165, 0];
  legend.forEach(([label, color], index) => {
    parts.push('<rect x="' + legendX + '" y="142" width="24" height="24" rx="5" fill="' + color + '"/>');
    parts.push('<text x="' + (legendX + 34) + '" y="162" class="small">' + label + "</text>");
    legendX += english ? englishLegendGaps[index] : label.length * 20 + 92;
  });

  const selectedIndices = [2, 7, 1, 3, 4, 0, 6, 23];
  const chartMetrics = selectedIndices.map((index) => metrics[index]);
  const barX = 500;
  const barWidth = 720;
  const rowStart = 220;
  const rowGap = 86;
  const barHeight = 38;

  chartMetrics.forEach((metric, rowIndex) => {
    const y = rowStart + rowIndex * rowGap;
    parts.push(svgTextBlock({
      x: 72,
      y: y + (english ? -7 : 4),
      text: copy.shortLabels[metric.index],
      maxCharacters: english ? 34 : 18,
      className: "label",
      lineGap: 26,
      wrap: english ? wrapEnglish : wrapTraditionalChinese,
    }));

    const segments = [
      { count: metric.stronglyAgree, color: "#0D5C63", textColor: "#FFFFFF" },
      { count: metric.agree, color: "#45A0A8", textColor: "#FFFFFF" },
      { count: metric.neutral, color: PALETTE.neutral, textColor: PALETTE.ink },
      { count: metric.disagree, color: PALETTE.disagree, textColor: "#FFFFFF" },
      { count: metric.stronglyDisagree, color: "#8C3B2A", textColor: "#FFFFFF" },
    ];
    let cursor = barX;
    segments.forEach((segment) => {
      const percentage = metric.n ? 100 * segment.count / metric.n : 0;
      const segmentWidth = barWidth * percentage / 100;
      if (segmentWidth > 0) {
        parts.push('<rect x="' + cursor + '" y="' + (y - 22) + '" width="' + segmentWidth +
          '" height="' + barHeight + '" fill="' + segment.color + '"/>');
        if (percentage >= 7) {
          parts.push('<text x="' + (cursor + segmentWidth / 2) + '" y="' + (y + 5) +
            '" text-anchor="middle" style="font-size:17px;font-weight:500;fill:' + segment.textColor +
            '">' + Math.round(percentage) + "%</text>");
        }
      }
      cursor += segmentWidth;
    });
    parts.push('<rect x="' + barX + '" y="' + (y - 22) + '" width="' + barWidth +
      '" height="' + barHeight + '" fill="none" stroke="' + PALETTE.paper + '" stroke-width="2" rx="4"/>');
    parts.push('<text x="1250" y="' + (y + 5) + '" class="value">' + (english ? "n = " : "n＝") + metric.n + "</text>");
  });

  parts.push('<text x="72" y="925" class="small">' + escapeXml(copy.note) + '</text>');
  parts.push("</svg>");
  return parts.join("\n");
}

function buildThemeMapSvg(metrics, language = "zh") {
  const english = language === "en";
  const copy = english ? {
    id: "theme-map-en",
    title: "Three principles and five action areas for AI safety governance",
    description: "An analytical framework drawn from twenty-four prompts. Three strongly supported process principles connect to five action areas; percentages refer only to the example evidence named in each card.",
    heading: "Three principles point to five areas for action",
    subtitle: "An analytical framework from 24 prompts—not one vote on a complete package.",
    centerHeading: "Three strongly supported principles",
    principles: [
      { label: "Youth participation", percent: Math.round(metrics[2].supportPct), n: metrics[2].n, body: "A formal role in policy\ndesign and review" },
      { label: "Evidence on harm", percent: Math.round(metrics[7].supportPct), n: metrics[7].n, body: "Use concrete evidence to\ncalibrate intervention" },
      { label: "Review and adapt", percent: Math.round(metrics[14].supportPct), n: metrics[14].n, body: "Review regularly\nas evidence changes", lowReach: true },
    ],
    pillars: [
      {
        title: "Education",
        color: PALETTE.green,
        fill: PALETTE.greenSoft,
        percent: Math.round(metrics[3].supportPct),
        evidenceLabel: "Parent–child safety education\nn = " + metrics[3].n,
        body: "Build practical AI safety skills\nat home and school",
      },
      {
        title: "Age + context",
        color: PALETTE.violet,
        fill: PALETTE.violetSoft,
        percent: 67,
        evidenceLabel: "Supported both statements\nn = 36",
        body: "Use age as a baseline, then\nconsider content, context and risk",
      },
      {
        title: "Impact assessment",
        color: PALETTE.amber,
        fill: PALETTE.amberSoft,
        percent: Math.round(metrics[4].supportPct),
        evidenceLabel: "Pre-launch assessment\nn = " + metrics[4].n,
        body: "Check impacts on children\nbefore products launch",
      },
      {
        title: "Victim support",
        color: PALETTE.disagree,
        fill: PALETTE.disagreeSoft,
        percent: Math.round(metrics[0].supportPct),
        evidenceLabel: "Victim support first\nn = " + metrics[0].n,
        body: "Provide victim support\nand routes to redress",
      },
      {
        title: "Rights safeguards",
        color: "#7C5361",
        fill: PALETTE.roseSoft,
        percent: Math.round(metrics[6].supportPct),
        evidenceLabel: "Prevent expanded surveillance\nn = " + metrics[6].n,
        body: "Prevent expanded surveillance\nand protect privacy",
      },
    ],
    denominatorNote: "Each percentage refers to the named example statement; denominators differ. Age + context combines two statements.",
  } : {
    id: "theme-map",
    title: "兒少 AI 安全治理的三項原則與五個行動面向",
    description: "這是本報告依二十四題整理出的治理架構。上排是三項高支持原則，下排是五個行動面向；各百分比只對應卡片所列的示例題目。",
    heading: "三項原則，帶出五個實作方向",
    subtitle: "這套架構整理自 24 題結果；各項比例分別來自不同題目。",
    centerHeading: "三項高支持原則",
    principles: [
      { label: "讓兒少正式參與", percent: Math.round(metrics[2].supportPct), n: metrics[2].n, body: "從政策設計到後續檢討\n都有正式參與管道" },
      { label: "先釐清傷害樣態", percent: Math.round(metrics[7].supportPct), n: metrics[7].n, body: "用具體證據決定\n介入方式與強度" },
      { label: "定期檢討、持續調整", percent: Math.round(metrics[14].supportPct), n: metrics[14].n, body: "隨技術、情境與新證據\n修正制度", lowReach: true },
    ],
    pillars: [
      {
        title: "安全教育",
        color: PALETTE.green,
        fill: PALETTE.greenSoft,
        percent: Math.round(metrics[3].supportPct),
        evidenceLabel: "親子 AI 安全教育\n" + metrics[3].n + " 人作答",
        body: "在家庭與學校培養\nAI 安全素養",
      },
      {
        title: "分齡＋情境",
        color: PALETTE.violet,
        fill: PALETTE.violetSoft,
        percent: 67,
        evidenceLabel: "兩項主張都支持\n36 人作答",
        body: "年齡作為基本界線\n並納入情境判斷",
      },
      {
        title: "影響評估",
        color: PALETTE.amber,
        fill: PALETTE.amberSoft,
        percent: Math.round(metrics[4].supportPct),
        evidenceLabel: "產品上線前評估\n" + metrics[4].n + " 人作答",
        body: "推出產品前先評估\n對兒少的影響",
      },
      {
        title: "協助與救濟",
        color: PALETTE.disagree,
        fill: PALETTE.disagreeSoft,
        percent: Math.round(metrics[0].supportPct),
        evidenceLabel: "被害人協助與救濟優先\n" + metrics[0].n + " 人作答",
        body: "建立被害人協助\n與救濟路徑",
      },
      {
        title: "權利保障",
        color: "#7C5361",
        fill: PALETTE.roseSoft,
        percent: Math.round(metrics[6].supportPct),
        evidenceLabel: "防止擴張監控\n" + metrics[6].n + " 人作答",
        body: "防止擴張監控\n並保障個人隱私",
      },
    ],
    denominatorNote: "各百分比只對應卡片所列的示例題目，分母不同；「分齡＋情境」合併兩題計算。",
  };
  const width = 1440;
  const height = 880;
  const parts = svgStart({
    id: copy.id,
    language: english ? "en" : "zh-Hant-TW",
    width,
    height,
    title: copy.title,
    description: copy.description,
  });
  svgHeader(parts, copy.heading, copy.subtitle);

  const centerX = 250;
  const centerY = 145;
  const centerWidth = 940;
  const centerHeight = 250;
  parts.push('<line x1="' + centerX + '" x2="' + (centerX + centerWidth) + '" y1="' + centerY + '" y2="' + centerY + '" stroke="' + PALETTE.ink + '" stroke-width="3"/>');
  parts.push('<line x1="' + centerX + '" x2="' + (centerX + centerWidth) + '" y1="' + (centerY + centerHeight) + '" y2="' + (centerY + centerHeight) + '" stroke="' + PALETTE.grid + '" stroke-width="1"/>');
  parts.push('<text x="720" y="190" text-anchor="middle" class="section">' + escapeXml(copy.centerHeading) + '</text>');
  copy.principles.forEach((principle, index) => {
    const x = 350 + index * 270;
    const meterWidth = 210;
    parts.push('<text x="' + x + '" y="232" class="label">' + escapeXml(principle.label) + '</text>');
    parts.push('<text x="' + x + '" y="272" style="font-size:30px;font-weight:500;fill:' + PALETTE.agree + '">' + principle.percent + '%</text>');
    parts.push('<text x="' + x + '" y="322" text-anchor="start" class="small">' +
      (english
        ? 'n = ' + principle.n + (principle.lowReach ? ' · fewer responses' : '')
        : principle.n + ' 人作答' + (principle.lowReach ? '・作答較少' : '')) + '</text>');
    parts.push('<rect x="' + x + '" y="290" width="' + meterWidth + '" height="9" rx="5" fill="' + PALETTE.paper + '"/>');
    parts.push('<rect x="' + x + '" y="290" width="' + (meterWidth * principle.percent / 100) +
      '" height="9" rx="5" fill="' + PALETTE.agree + '"/>');
    parts.push(svgTextBlock({
      x,
      y: 352,
      text: principle.body,
      maxCharacters: english ? 27 : 11,
      className: "tiny",
      lineGap: 21,
      wrap: english ? wrapEnglish : wrapTraditionalChinese,
    }));
  });

  const pillarY = 480;
  const pillarWidth = 246;
  const pillarHeight = english ? 330 : 300;
  const gap = 20;
  const startX = 65;
  const pillars = copy.pillars;

  pillars.forEach((pillar, index) => {
    const x = startX + index * (pillarWidth + gap);
    const connectorX = x + pillarWidth / 2;
    const connectorStart = centerY + centerHeight;
    parts.push('<path d="M720 ' + connectorStart + ' C720 438 ' + connectorX + ' 438 ' + connectorX +
      ' ' + pillarY + '" fill="none" stroke="' + PALETTE.grid + '" stroke-width="2"/>');
    parts.push('<circle cx="' + connectorX + '" cy="' + pillarY + '" r="6" fill="' + pillar.color + '"/>');
    parts.push('<line x1="' + x + '" x2="' + (x + pillarWidth) + '" y1="' + pillarY + '" y2="' + pillarY + '" stroke="' + pillar.color + '" stroke-width="4"/>');
    if (index > 0) {
      parts.push('<line x1="' + (x - gap / 2) + '" x2="' + (x - gap / 2) + '" y1="' + pillarY + '" y2="' + (pillarY + pillarHeight) + '" stroke="' + PALETTE.grid + '" stroke-width="1"/>');
    }
    parts.push(svgTextBlock({
      x: x + 24,
      y: pillarY + 48,
      text: pillar.title,
      maxCharacters: english ? 13 : 8,
      className: english ? "compact" : "section",
      lineGap: 27,
      wrap: english ? wrapEnglish : wrapTraditionalChinese,
    }));
    parts.push('<text x="' + (x + 24) + '" y="' + (pillarY + (english ? 120 : 103)) +
      '" style="font-size:32px;font-weight:500;fill:' + pillar.color + '">' +
      pillar.percent + '%</text>');
    const meterWidth = pillarWidth - 48;
    parts.push('<rect x="' + (x + 24) + '" y="' + (pillarY + (english ? 138 : 121)) + '" width="' + meterWidth +
      '" height="9" rx="5" fill="' + PALETTE.paper + '"/>');
    parts.push('<rect x="' + (x + 24) + '" y="' + (pillarY + (english ? 138 : 121)) + '" width="' +
      (meterWidth * pillar.percent / 100) + '" height="9" rx="5" fill="' + pillar.color + '"/>');
    parts.push(svgTextBlock({
      x: x + 24,
      y: pillarY + (english ? 175 : 158),
      text: pillar.evidenceLabel,
      maxCharacters: english ? 22 : 11,
      className: "tiny",
      lineGap: 20,
      wrap: english ? wrapEnglish : wrapTraditionalChinese,
    }));
    parts.push(svgTextBlock({
      x: x + 24,
      y: pillarY + (english ? 243 : 226),
      text: pillar.body,
      maxCharacters: english ? 20 : 10,
      className: english ? "compact" : "body",
      lineGap: english ? 24 : 26,
      wrap: english ? wrapEnglish : wrapTraditionalChinese,
    }));
  });

  parts.push('<text x="720" y="' + (english ? 855 : 842) + '" text-anchor="middle" class="small">' + escapeXml(copy.denominatorNote) + '</text>');
  parts.push('</svg>');
  return parts.join("\n");
}

function circleIntersectionArea(radiusA, radiusB, distance) {
  if (distance >= radiusA + radiusB) return 0;
  if (distance <= Math.abs(radiusA - radiusB)) return Math.PI * Math.min(radiusA, radiusB) ** 2;
  const distanceSquared = distance ** 2;
  const radiusASquared = radiusA ** 2;
  const radiusBSquared = radiusB ** 2;
  const angleA = Math.acos(Math.max(-1, Math.min(1, (distanceSquared + radiusASquared - radiusBSquared) / (2 * distance * radiusA))));
  const angleB = Math.acos(Math.max(-1, Math.min(1, (distanceSquared + radiusBSquared - radiusASquared) / (2 * distance * radiusB))));
  const triangle = 0.5 * Math.sqrt(Math.max(0,
    (-distance + radiusA + radiusB) *
    (distance + radiusA - radiusB) *
    (distance - radiusA + radiusB) *
    (distance + radiusA + radiusB),
  ));
  return radiusASquared * angleA + radiusBSquared * angleB - triangle;
}

function vennCircleDistance(radiusA, radiusB, targetArea) {
  const maximumOverlap = Math.PI * Math.min(radiusA, radiusB) ** 2;
  if (targetArea <= 0) return radiusA + radiusB;
  if (targetArea >= maximumOverlap) return Math.abs(radiusA - radiusB);
  let low = Math.abs(radiusA - radiusB);
  let high = radiusA + radiusB;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (circleIntersectionArea(radiusA, radiusB, midpoint) > targetArea) low = midpoint;
    else high = midpoint;
  }
  return (low + high) / 2;
}

function buildVennLayout(overlap, maximumRadius, centerX) {
  const leftTotal = overlap.counts.leftOnly + overlap.counts.both;
  const rightTotal = overlap.counts.rightOnly + overlap.counts.both;
  const largestTotal = Math.max(1, leftTotal, rightTotal);
  const areaPerPerson = Math.PI * maximumRadius ** 2 / largestTotal;
  const radiusA = Math.sqrt(leftTotal * areaPerPerson / Math.PI);
  const radiusB = Math.sqrt(rightTotal * areaPerPerson / Math.PI);
  const distance = vennCircleDistance(radiusA, radiusB, overlap.counts.both * areaPerPerson);
  const totalWidth = radiusA + distance + radiusB;
  const circleAX = centerX - totalWidth / 2 + radiusA;
  return {
    radiusA,
    radiusB,
    circleAX,
    circleBX: circleAX + distance,
    overlapX: circleAX + distance / 2,
  };
}

function buildTensionsSvg({ metrics, tensionOverlaps }, language = "zh") {
  const english = language === "en";
  const copy = english ? {
    id: "core-tensions-en",
    title: "Venn diagrams of support for three paired policy priorities",
    description: "Three area-proportional Venn diagrams show how many joint respondents supported option A, option B, both options, or neither option.",
    heading: "Many respondents supported both sides of an apparent trade-off",
    subtitle: "The overlap shows people who supported both statements in each pair.",
    joint: (n) => n + " people answered both statements",
    both: "supported both",
    leftOnly: "A only",
    rightOnly: "B only",
    neither: "Outside both",
    everyone: "Everyone supported at least one",
    rows: [
      { title: "Prevention + redress", left: "A · Impact assessment", right: "B · Victim support" },
      { title: "Age + context", left: "A · Age boundaries", right: "B · Context matters" },
      { title: "Rights + creative freedom", left: "A · Limit surveillance", right: "B · Creative freedom" },
    ],
    note: "Within each panel, circle and overlap areas are proportional to people. Panel sizes should not be compared. Support combines agree and strongly agree.",
  } : {
    id: "core-tensions",
    title: "三組政策主張的支持重疊圖",
    description: "三組依人數比例繪製的文氏圖，呈現共同作答者支持 A、支持 B、同時支持兩項，或兩項都未支持的人數。",
    heading: "許多人同時支持看似拉扯的兩種做法",
    subtitle: "兩個圓的重疊區，代表同一位參與者同時支持兩項主張。",
    joint: (n) => n + " 人共同回答兩題",
    both: "兩項都支持",
    leftOnly: "只支持 A",
    rightOnly: "只支持 B",
    neither: "兩項都未支持",
    everyone: "所有人至少支持一項",
    rows: [
      { title: "事前預防＋事後救濟", left: "A・影響評估", right: "B・被害人協助" },
      { title: "年齡界線＋情境判斷", left: "A・年齡界線", right: "B・情境判斷" },
      { title: "權利保障＋創作自由", left: "A・限制擴張監控", right: "B・保障創作自由" },
    ],
    note: "每組內的圓面積與重疊面積依人數比例繪製；組與組的大小不可直接比較。支持包含同意與非常同意。",
  };
  assert(tensionOverlaps.length === copy.rows.length, "Every tension pair needs localized copy.");
  tensionOverlaps.forEach((overlap, index) => {
    assert(overlap.leftIndex === TENSION_PAIR_INDEXES[index].leftIndex && overlap.rightIndex === TENSION_PAIR_INDEXES[index].rightIndex, "Tension pair order mismatch.");
    assert(metrics[overlap.leftIndex] && metrics[overlap.rightIndex], "Tension pair references an unknown statement.");
  });

  const width = 1440;
  const height = 900;
  const parts = svgStart({
    id: copy.id,
    language: english ? "en" : "zh-Hant-TW",
    width,
    height,
    title: copy.title,
    description: copy.description,
  });
  svgHeader(parts, copy.heading, copy.subtitle);
  parts.push('<line x1="72" x2="1368" y1="142" y2="142" class="grid"/>');
  tensionOverlaps.forEach((overlap, index) => {
    const row = copy.rows[index];
    const panelX = 72 + index * 432;
    const panelCenter = panelX + 200;
    const layout = buildVennLayout(overlap, 118, panelCenter);
    const circleY = 440;
    parts.push('<text x="' + panelCenter + '" y="188" text-anchor="middle" class="section">' + escapeXml(row.title) + '</text>');
    parts.push('<text x="' + panelCenter + '" y="220" text-anchor="middle" class="small">' + escapeXml(copy.joint(overlap.jointN)) + '</text>');
    parts.push(svgTextBlock({ x: panelX + 92, y: 274, text: row.left, maxCharacters: english ? 18 : 8, className: "compact", anchor: "middle", lineGap: 22, wrap: english ? wrapEnglish : wrapTraditionalChinese }));
    parts.push(svgTextBlock({ x: panelX + 308, y: 274, text: row.right, maxCharacters: english ? 18 : 8, className: "compact", anchor: "middle", lineGap: 22, wrap: english ? wrapEnglish : wrapTraditionalChinese }));
    parts.push('<circle cx="' + layout.circleAX + '" cy="' + circleY + '" r="' + layout.radiusA + '" fill="' + PALETTE.agree + '" fill-opacity="0.28" stroke="' + PALETTE.agree + '" stroke-width="3"/>');
    parts.push('<circle cx="' + layout.circleBX + '" cy="' + circleY + '" r="' + layout.radiusB + '" fill="' + PALETTE.violet + '" fill-opacity="0.26" stroke="' + PALETTE.violet + '" stroke-width="3"/>');
    parts.push('<text x="' + layout.overlapX + '" y="' + (circleY - 24) + '" text-anchor="middle" class="label">' + escapeXml(copy.both) + '</text>');
    parts.push('<text x="' + layout.overlapX + '" y="' + (circleY + 25) + '" text-anchor="middle" style="font-size:42px;font-weight:500;fill:' + PALETTE.ink + '">' + pct(overlap.percentages.both) + '</text>');
    parts.push('<text x="' + layout.overlapX + '" y="' + (circleY + 54) + '" text-anchor="middle" class="tiny">' + overlap.counts.both + (english ? " people" : " 人") + '</text>');
    parts.push('<text x="' + (panelX + 86) + '" y="590" text-anchor="middle" class="small">' + escapeXml(copy.leftOnly) + ' ' + pct(overlap.percentages.leftOnly) + '</text>');
    parts.push('<text x="' + (panelX + 314) + '" y="590" text-anchor="middle" class="small">' + escapeXml(copy.rightOnly) + ' ' + pct(overlap.percentages.rightOnly) + '</text>');
    const outsideText = overlap.counts.neither
      ? copy.neither + ' ' + pct(overlap.percentages.neither) + ' · ' + overlap.counts.neither + (english ? " people" : " 人")
      : copy.everyone;
    parts.push('<text x="' + panelCenter + '" y="632" text-anchor="middle" class="small">' + escapeXml(outsideText) + '</text>');
    if (index < tensionOverlaps.length - 1) parts.push('<line x1="' + (panelX + 416) + '" x2="' + (panelX + 416) + '" y1="170" y2="650" class="grid"/>');
  });
  parts.push('<line x1="72" x2="1368" y1="682" y2="682" class="grid"/>');
  parts.push(svgTextBlock({ x: 72, y: 724, text: copy.note, maxCharacters: english ? 118 : 56, className: "small", lineGap: 25, wrap: english ? wrapEnglish : wrapTraditionalChinese }));
  parts.push('</svg>');
  return parts.join("\n");
}

function buildCoverageSvg(metrics, language = "zh") {
  const english = language === "en";
  const copy = english ? {
    id: "response-coverage-en",
    title: "Statement order and response counts",
    description: "Response counts declined substantially across 24 statements, from 69 responses to the first statement to 23 responses to the final statement. The first, middle and final groups of eight statements averaged 60.5, 38.8 and 29.3 responses.",
    heading: "Fewer later responses do not mean lower support",
    subtitle: "Response counts fell from 69 to 23 across the sequence.",
    bands: ["First 8", "Middle 8", "Final 8"],
    averagePrefix: "Average ",
    averageSuffix: " responses",
    xAxis: "Statement order",
    yAxis: "Number of responses",
    pointTitle: (metric) => "Statement " + (metric.index + 1) + ": " + metric.n + " responses",
    firstCallout: "n = 69",
    lastCallout: "n = 23",
    note: "Later statements should be revisited; fewer responses do not mean participants cared less.",
  } : {
    id: "response-coverage",
    title: "敘述順序與作答人數變化",
    description: "二十四項敘述的作答人數隨順序明顯下降，從第一題六十九人降到第二十四題二十三人。前、中、後八題平均作答人數分別為六十點五、三十八點八與二十九點三。",
    heading: "越後面的題目，越需要保守解讀",
    subtitle: "作答人數從 69 人降至 23 人。",
    bands: ["前 8 題", "中 8 題", "後 8 題"],
    averagePrefix: "平均 ",
    averageSuffix: " 人",
    xAxis: "題目順序",
    yAxis: "作答人數",
    pointTitle: (metric) => "第 " + (metric.index + 1) + " 題：" + metric.n + " 人作答",
    firstCallout: "69 人",
    lastCallout: "23 人",
    note: "後段題目應優先再次確認；作答較少表示證據較薄，無法判斷重視或支持程度。",
  };
  const width = 1440;
  const height = 800;
  const parts = svgStart({
    id: copy.id,
    language: english ? "en" : "zh-Hant-TW",
    width,
    height,
    title: copy.title,
    description: copy.description,
  });
  svgHeader(parts, copy.heading, copy.subtitle);

  const plot = { left: 128, right: 1330, top: 210, bottom: 620 };
  const x = (index) => scale(index, 0, metrics.length - 1, plot.left, plot.right);
  const y = (value) => scale(value, 20, 75, plot.bottom, plot.top);
  const bands = [
    { from: 0, to: 7, average: 60.5, label: copy.bands[0], fill: PALETTE.agreeSoft },
    { from: 8, to: 15, average: 38.75, label: copy.bands[1], fill: PALETTE.violetSoft },
    { from: 16, to: 23, average: 29.25, label: copy.bands[2], fill: PALETTE.amberSoft },
  ];

  bands.forEach((band) => {
    const left = band.from === 0 ? plot.left : (x(band.from - 1) + x(band.from)) / 2;
    const right = band.to === metrics.length - 1 ? plot.right : (x(band.to) + x(band.to + 1)) / 2;
    parts.push('<rect x="' + left + '" y="' + plot.top + '" width="' + (right - left) +
      '" height="' + (plot.bottom - plot.top) + '" fill="' + band.fill + '" fill-opacity="0.55"/>');
    parts.push('<text x="' + ((left + right) / 2) + '" y="170" text-anchor="middle" class="section">' +
      band.label + '</text>');
    parts.push('<text x="' + ((left + right) / 2) + '" y="198" text-anchor="middle" class="small">' +
      copy.averagePrefix + round(band.average, 1) + copy.averageSuffix + '</text>');
  });

  [20, 30, 40, 50, 60, 70].forEach((value) => {
    const yy = y(value);
    parts.push('<line x1="' + plot.left + '" x2="' + plot.right + '" y1="' + yy + '" y2="' + yy + '" class="grid"/>');
    parts.push('<text x="' + (plot.left - 18) + '" y="' + (yy + 7) + '" text-anchor="end" class="small">' + value + '</text>');
  });
  [1, 4, 8, 12, 16, 20, 24].forEach((value) => {
    const xx = x(value - 1);
    parts.push('<text x="' + xx + '" y="658" text-anchor="middle" class="small">' + value + '</text>');
  });
  parts.push('<line x1="' + plot.left + '" x2="' + plot.right + '" y1="' + plot.bottom + '" y2="' + plot.bottom + '" class="axis"/>');
  parts.push('<line x1="' + plot.left + '" x2="' + plot.left + '" y1="' + plot.top + '" y2="' + plot.bottom + '" class="axis"/>');
  parts.push('<text x="720" y="710" text-anchor="middle" class="body">' + copy.xAxis + '</text>');
  parts.push('<text x="42" y="415" text-anchor="middle" class="body" transform="rotate(-90 42 415)">' + copy.yAxis + '</text>');

  const points = metrics.map((metric) => x(metric.index) + ',' + y(metric.n)).join(' ');
  parts.push('<polyline points="' + points + '" fill="none" stroke="' + PALETTE.agree + '" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>');
  metrics.forEach((metric) => {
    parts.push('<circle cx="' + x(metric.index) + '" cy="' + y(metric.n) + '" r="7" fill="' + PALETTE.paper + '" stroke="' + PALETTE.agree + '" stroke-width="4"><title>' + escapeXml(copy.pointTitle(metric)) + '</title></circle>');
  });
  parts.push('<text x="' + (x(0) + 14) + '" y="' + (y(metrics[0].n) - 20) + '" class="label callout">' + copy.firstCallout + '</text>');
  parts.push('<text x="' + (x(23) - 14) + '" y="' + (y(metrics[23].n) - 48) + '" text-anchor="end" class="label callout">' + copy.lastCallout + '</text>');
  parts.push('<rect x="72" y="744" width="1296" height="40" rx="14" fill="' + PALETTE.paper + '"/>');
  parts.push('<text x="720" y="772" text-anchor="middle" class="small">' + escapeXml(copy.note) + '</text>');
  parts.push('</svg>');
  return parts.join("\n");
}

function highestNeutralMetrics(metrics, limit = 5) {
  return [...metrics]
    .sort((left, right) => right.neutralPct - left.neutralPct || right.n - left.n || left.index - right.index)
    .slice(0, limit);
}

function buildPauseMapSvg({ metrics, voterCount }, language = "zh") {
  const english = language === "en";
  const lowReachThreshold = Math.ceil(voterCount * LOW_REACH_SHARE);
  const selected = highestNeutralMetrics(metrics);
  const labels = english ? EN_SHORT_LABELS : SHORT_LABELS;
  const copy = english ? {
    id: "pause-map-en",
    title: "Prompts with the highest neutral response shares",
    description: "A ranked lollipop chart of the five prompts with the highest neutral shares. Percentages use each prompt's respondents, and prompts with fewer than half of voters responding are marked as having fewer responses.",
    heading: "Higher-neutral statements need follow-up",
    subtitle: "Neutral is not disagreement; this session did not measure why people chose it.",
    axis: "Neutral among statement respondents",
    responseCount: (n) => "n = " + n,
    lowReach: "FEWER RESPONSES",
    note: "Neutral means the respondent selected the neutral option; it does not include missing responses. Percentages use each prompt’s respondents. Prompts with fewer than " + lowReachThreshold + " responses are labelled ‘fewer responses’.",
    questionNote: "† Q24 was phrased as a question, making its response meaning less clear.",
  } : {
    id: "pause-map",
    title: "中立比例最高的五題",
    description: "圖中列出中立比例最高的五題；百分比以各題作答者為分母，作答者少於全部投票者一半者標示為作答較少。",
    heading: "下一輪可優先重新確認中立比例較高的題目",
    subtitle: "中立回應需要進一步理解；本次資料無法判斷參與者選擇中立的原因。",
    axis: "中立比例（以該題作答者為分母）",
    responseCount: (n) => n + " 人作答",
    lowReach: "作答較少",
    note: "中立僅指作答者選擇「中立」選項；未作答另行計算。百分比以各題作答者為分母，少於 " + lowReachThreshold + " 人作答標為「作答較少」。",
    questionNote: "† 第 24 題以問句呈現，無法把同意／不同意直接解讀為政策支持／反對。",
  };
  const width = 1440;
  const height = 880;
  const parts = svgStart({
    id: copy.id,
    language: english ? "en" : "zh-Hant-TW",
    width,
    height,
    title: copy.title,
    description: copy.description,
  });
  svgHeader(parts, copy.heading, copy.subtitle);

  const plotStart = 720;
  const plotWidth = 580;
  const plotEnd = plotStart + plotWidth;
  parts.push('<text x="' + plotEnd + '" y="166" text-anchor="end" class="small">' + escapeXml(copy.axis) + '</text>');
  for (const tick of [0, 25, 50]) {
    const x = scale(tick, 0, 50, plotStart, plotEnd);
    parts.push('<line x1="' + x + '" x2="' + x + '" y1="182" y2="700" class="grid"/>');
    parts.push('<text x="' + x + '" y="207" text-anchor="middle" class="tiny">' + tick + '%</text>');
  }

  selected.forEach((metric, index) => {
    const y = 258 + index * 102;
    const label = labels[metric.index] + (metric.index === 23 ? "†" : "");
    parts.push('<text x="72" y="' + y + '" class="small">#' + (metric.index + 1) + '</text>');
    parts.push(svgTextBlock({
      x: 126,
      y: y - 10,
      text: label,
      maxCharacters: english ? 52 : 22,
      className: "compact",
      lineGap: 22,
      wrap: english ? wrapEnglish : wrapTraditionalChinese,
    }));
    parts.push('<text x="126" y="' + (y + 42) + '" class="small">' + escapeXml(copy.responseCount(metric.n)) + '</text>');
    if (metric.n < lowReachThreshold) {
      const pillX = english ? 215 : 245;
      const pillWidth = english ? 170 : 86;
      parts.push('<rect x="' + pillX + '" y="' + (y + 20) + '" width="' + pillWidth + '" height="30" rx="15" fill="none" stroke="' + PALETTE.amber + '" stroke-width="1.5"/>');
      parts.push('<text x="' + (pillX + pillWidth / 2) + '" y="' + (y + 41) + '" text-anchor="middle" class="tiny" style="fill:' + PALETTE.amber + '">' + escapeXml(copy.lowReach) + '</text>');
    }
    const valueX = scale(metric.neutralPct, 0, 50, plotStart, plotEnd);
    parts.push('<line x1="' + plotStart + '" x2="' + valueX + '" y1="' + y + '" y2="' + y + '" stroke="' + PALETTE.violet + '" stroke-width="8" stroke-linecap="round"/>');
    parts.push('<circle cx="' + valueX + '" cy="' + y + '" r="11" fill="' + PALETTE.paper + '" stroke="' + PALETTE.violet + '" stroke-width="5"/>');
    parts.push('<text x="' + (valueX + 20) + '" y="' + (y + 7) + '" class="label">' + pct(metric.neutralPct) + '</text>');
  });

  parts.push('<line x1="72" x2="1368" y1="764" y2="764" class="grid"/>');
  parts.push(svgTextBlock({ x: 72, y: 798, text: copy.note, maxCharacters: english ? 136 : 66, className: "small", lineGap: 22, wrap: english ? wrapEnglish : wrapTraditionalChinese }));
  parts.push('<text x="72" y="856" class="small">' + escapeXml(copy.questionNote) + '</text>');
  parts.push('</svg>');
  return parts.join("\n");
}

function buildOpinionGroupsSvg(groupAnalysis, language = "zh") {
  const english = language === "en";
  const publishable = groupAnalysis.status === "publishable";
  const unavailable = groupAnalysis.status === "unavailable";
  const stability = Number.isFinite(groupAnalysis.bootstrapMedianAri)
    ? groupAnalysis.bootstrapMedianAri
    : 0;
  const stabilityThreshold = groupAnalysis.thresholds.minBootstrapMedianAri;
  const smallestGroup = groupAnalysis.groupSizes.length
    ? Math.min(...groupAnalysis.groupSizes)
    : null;
  const kValues = [2, 3, 4, 5];
  const kColors = {
    2: PALETTE.agree,
    3: PALETTE.violet,
    4: PALETTE.amber,
    5: "#7C5361",
  };
  const frequencies = kValues.map((k) => ({
    k,
    count: Number(groupAnalysis.bootstrapSelectedKFrequency[String(k)] || 0),
  }));
  const completed = groupAnalysis.bootstrapReplicates || frequencies.reduce((sum, entry) => sum + entry.count, 0);
  const frequencyTotal = frequencies.reduce((sum, entry) => sum + entry.count, 0);
  if (!unavailable) assert(frequencyTotal === completed, "Bootstrap K frequencies do not reconcile.");
  const bootstrapRuns = groupAnalysis.bootstrapRuns || [];
  if (!unavailable) assert(bootstrapRuns.length === completed, "Bootstrap run records do not reconcile.");
  const originalKCount = Number(groupAnalysis.bootstrapSelectedKFrequency[String(groupAnalysis.selectedK)] || 0);
  const copy = english ? {
    id: "opinion-groups-en",
    title: "Reliability check for Pol.is-inspired opinion groups",
    description: "A one-hundred-tile mosaic showing how many groups were selected in each statement-bootstrap rerun, alongside the adjusted Rand membership-stability score and report-specific publication threshold.",
    heading: publishable ? "Group structure remained stable across reruns" : unavailable ? "Not enough shared voting data to test groups" : "100 reruns did not agree on one grouping",
    subtitle: publishable ? "Each square is one rerun; colour shows the selected group count." : unavailable ? "More overlapping responses are needed." : "Each square is one rerun; the same group count does not guarantee the same members.",
    badge: publishable ? "PUBLISHABLE" : unavailable ? "UNAVAILABLE" : "WITHHELD",
    reruns: "Group count selected",
    runs: (count) => count + (count === 1 ? " rerun" : " reruns"),
    original: originalKCount + " of " + completed + " reruns selected the original " + groupAnalysis.selectedK + "-group solution.",
    stability: "Membership stability across reruns",
    threshold: "Report publication threshold " + stabilityThreshold.toFixed(2),
    passed: groupAnalysis.bootstrapPassCount + " of " + completed + " reruns reached the threshold",
    low: "less stable",
    high: "more stable",
    footer: publishable
      ? "The group solution clears the report’s size and stability checks."
      : unavailable
        ? "No participant grouping is calculated or displayed."
        : "Stability was " + stability.toFixed(2) + " and the smallest group had " + (smallestGroup ?? "too few") + " people; groups are withheld.",
  } : {
    id: "opinion-groups",
    title: "類 Pol.is 觀點群組可靠度檢核",
    description: "以一百個方格呈現每次題目重抽後選出的群組數，並對照成員分組的調整蘭德指數穩定度與本報告自訂的發布門檻。",
    heading: publishable ? "重跑後仍形成穩定分群" : unavailable ? "共同作答資料不足，暫不分群" : "100 次重跑沒有形成一致分群",
    subtitle: publishable ? "每格代表一次重跑，顏色代表選出的群組數。" : unavailable ? "需要更多人回答相同題目。" : "每格代表一次重跑；群組數相同時，成員組成仍可能不同。",
    badge: publishable ? "可發布" : unavailable ? "資料不足" : "暫不發布",
    reruns: "重跑後選出的群組數",
    runs: (count) => count + " 次",
    original: completed + " 次重跑中，僅 " + originalKCount + " 次選出原本的 " + groupAnalysis.selectedK + " 組解。",
    stability: "重跑後的成員穩定度",
    threshold: "本報告發布門檻 " + stabilityThreshold.toFixed(2),
    passed: completed + " 次中有 " + groupAnalysis.bootstrapPassCount + " 次達到門檻",
    low: "較不穩定",
    high: "較穩定",
    footer: publishable
      ? "分群通過本報告的人數與穩定度檢核。"
      : unavailable
        ? "本場不計算，也不呈現參與者分群。"
        : "成員穩定度僅 " + stability.toFixed(2) + "，且最小群組僅 " + (smallestGroup ?? "少數") + " 人；因此暫不發布群組。",
  };
  const width = 1440;
  const height = 780;
  const parts = svgStart({
    id: copy.id,
    language: english ? "en" : "zh-Hant-TW",
    width,
    height,
    title: copy.title,
    description: copy.description,
  });
  svgHeader(parts, copy.heading, copy.subtitle);
  const badgeWidth = english ? 176 : 150;
  parts.push('<rect x="' + (1368 - badgeWidth) + '" y="46" width="' + badgeWidth + '" height="48" rx="24" fill="' +
    (publishable ? PALETTE.agreeSoft : PALETTE.paper) + '" stroke="' +
    (publishable ? PALETTE.agree : PALETTE.grid) + '" stroke-width="2"/>');
  parts.push('<text x="' + (1368 - badgeWidth / 2) + '" y="78" text-anchor="middle" class="small" style="font-weight:500;fill:' +
    (publishable ? PALETTE.agree : PALETTE.muted) + '">' + escapeXml(copy.badge) + '</text>');

  if (unavailable) {
    parts.push('<rect x="72" y="190" width="1296" height="330" rx="28" fill="' + PALETTE.paper + '"/>');
    parts.push('<text x="720" y="340" text-anchor="middle" style="font-size:64px;font-weight:500;fill:' + PALETTE.muted + '">—</text>');
    parts.push('<text x="720" y="408" text-anchor="middle" class="section">' + escapeXml(copy.footer) + '</text>');
    parts.push('</svg>');
    return parts.join("\n");
  }

  const tileSize = 34;
  const tileGap = 8;
  const tileColumns = 10;
  bootstrapRuns.forEach((run, tileIndex) => {
    const column = tileIndex % tileColumns;
    const row = Math.floor(tileIndex / tileColumns);
    const passed = run.adjustedRand >= stabilityThreshold;
    parts.push('<rect x="' + (72 + column * (tileSize + tileGap)) + '" y="' + (196 + row * (tileSize + tileGap)) + '" width="' + tileSize + '" height="' + tileSize + '" rx="7" fill="' + kColors[run.selectedK] + '"' +
      (passed ? ' stroke="' + PALETTE.ink + '" stroke-width="4"' : '') + '/>');
  });
  parts.push('<text x="72" y="650" class="small">' + (english ? "Each square = one rerun" : "每格＝一次重跑") + '</text>');

  parts.push('<text x="570" y="210" class="section">' + escapeXml(copy.reruns) + '</text>');
  frequencies.forEach((entry, index) => {
    const y = 263 + index * 52;
    parts.push('<rect x="570" y="' + (y - 22) + '" width="24" height="24" rx="6" fill="' + kColors[entry.k] + '"/>');
    parts.push('<text x="610" y="' + y + '" class="body">K = ' + entry.k + '</text>');
    parts.push('<text x="870" y="' + y + '" text-anchor="end" class="label">' + escapeXml(copy.runs(entry.count)) + '</text>');
  });
  parts.push('<text x="570" y="478" class="small">' + escapeXml(copy.original) + '</text>');

  parts.push('<line x1="930" x2="930" y1="196" y2="625" class="grid"/>');
  parts.push('<text x="982" y="210" class="section">' + escapeXml(copy.stability) + '</text>');
  parts.push('<text x="982" y="300" style="font-size:62px;font-weight:500;fill:' + (publishable ? PALETTE.agree : PALETTE.amber) + '">' + stability.toFixed(2) + '</text>');
  parts.push('<text x="982" y="340" class="small">' + escapeXml(copy.threshold) + '</text>');
  const stabilityX = 982;
  const stabilityWidth = 330;
  const stabilityValue = Math.max(0, Math.min(1, stability));
  const thresholdX = stabilityX + stabilityWidth * stabilityThreshold;
  parts.push('<rect x="' + stabilityX + '" y="394" width="' + stabilityWidth + '" height="18" rx="9" fill="' + PALETTE.grid + '"/>');
  parts.push('<rect x="' + stabilityX + '" y="394" width="' + (stabilityWidth * stabilityValue) + '" height="18" rx="9" fill="' + (publishable ? PALETTE.agree : PALETTE.amber) + '"/>');
  parts.push('<line x1="' + thresholdX + '" x2="' + thresholdX + '" y1="378" y2="428" stroke="' + PALETTE.ink + '" stroke-width="3"/>');
  parts.push('<text x="' + stabilityX + '" y="454" class="tiny">' + escapeXml(copy.low) + '</text>');
  parts.push('<text x="' + (stabilityX + stabilityWidth) + '" y="454" text-anchor="end" class="tiny">' + escapeXml(copy.high) + '</text>');
  parts.push('<text x="982" y="500" class="small">' + escapeXml(copy.passed) + '</text>');

  parts.push('<rect x="72" y="686" width="1296" height="62" rx="20" fill="' + (publishable ? PALETTE.agreeSoft : PALETTE.paper) + '"/>');
  parts.push('<text x="720" y="726" text-anchor="middle" class="body">' + escapeXml(copy.footer) + '</text>');
  parts.push('</svg>');
  return parts.join("\n");
}

function opinionContourGeometry(profiles, contourScale = 2.25) {
  const geometry = profiles.map((profile) => {
    const { varianceX, covarianceXY, varianceY } = profile.spread;
    const trace = varianceX + varianceY;
    const difference = Math.sqrt(Math.max(0, (varianceX - varianceY) ** 2 + 4 * covarianceXY ** 2));
    const major = Math.sqrt(Math.max(0, (trace + difference) / 2));
    const minor = Math.sqrt(Math.max(0, (trace - difference) / 2));
    const angle = 0.5 * Math.atan2(2 * covarianceXY, varianceX - varianceY);
    return { profile, major, minor, angle };
  });
  const extents = geometry.flatMap(({ profile, major, minor, angle }) => {
    const xRadius = contourScale * Math.sqrt((major * Math.cos(angle)) ** 2 + (minor * Math.sin(angle)) ** 2);
    const yRadius = contourScale * Math.sqrt((major * Math.sin(angle)) ** 2 + (minor * Math.cos(angle)) ** 2);
    return [
      { x: profile.centroid[0] - xRadius, y: profile.centroid[1] - yRadius },
      { x: profile.centroid[0] + xRadius, y: profile.centroid[1] + yRadius },
    ];
  });
  const xMinimum = Math.min(...extents.map((point) => point.x));
  const xMaximum = Math.max(...extents.map((point) => point.x));
  const yMinimum = Math.min(...extents.map((point) => point.y));
  const yMaximum = Math.max(...extents.map((point) => point.y));
  const xPadding = Math.max(0.2, (xMaximum - xMinimum) * 0.06);
  const yPadding = Math.max(0.2, (yMaximum - yMinimum) * 0.06);
  return {
    geometry,
    domain: {
      xMinimum: xMinimum - xPadding,
      xMaximum: xMaximum + xPadding,
      yMinimum: yMinimum - yPadding,
      yMaximum: yMaximum + yPadding,
    },
    contourScale,
  };
}

function opinionContourPath(entry, contourScale, domain, plot) {
  const x = (value) => scale(value, domain.xMinimum, domain.xMaximum, plot.left, plot.right);
  const y = (value) => scale(value, domain.yMinimum, domain.yMaximum, plot.bottom, plot.top);
  const points = Array.from({ length: 73 }, (_, index) => {
    const theta = index / 72 * 2 * Math.PI;
    const majorPosition = contourScale * entry.major * Math.cos(theta);
    const minorPosition = contourScale * entry.minor * Math.sin(theta);
    const dataX = entry.profile.centroid[0]
      + majorPosition * Math.cos(entry.angle)
      - minorPosition * Math.sin(entry.angle);
    const dataY = entry.profile.centroid[1]
      + majorPosition * Math.sin(entry.angle)
      + minorPosition * Math.cos(entry.angle);
    return [x(dataX), y(dataY)];
  });
  return points.map(([pointX, pointY], index) => (
    (index ? "L" : "M") + round(pointX, 2) + " " + round(pointY, 2)
  )).join(" ") + " Z";
}

function buildOpinionLandscapeSvg(groupAnalysis, language = "zh") {
  const english = language === "en";
  const tendencyData = groupAnalysis.opinionTendencies;
  assert(tendencyData.available && tendencyData.profiles.length === 3, "Three opinion tendencies are required for the landscape.");
  const copy = english ? {
    id: "opinion-tendencies-en",
    title: "Two opinion dimensions and three overlapping tendencies",
    description: "An exploratory map with two response dimensions and three overlapping soft profiles: care and participation, upstream safeguards, and adaptive governance. People are not assigned to fixed camps.",
    heading: "Three overlapping tendencies—not opposing camps",
    subtitle: "A person can align with more than one. The shaded areas show emphasis, not fixed identities.",
    xLeft: "More product rules & checks",
    xRight: "More education, context & liberty",
    yTop: "More support & redress after harm",
    yBottom: "More prevention before harm",
    sideHeading: "What each tendency emphasises",
    sharedLabel: "Shared across all three",
    shared: "Formal youth participation and research into concrete harms",
    profiles: {
      care: {
        name: "Care & participation",
        short: ["Victim support", "youth participation"],
        details: ["Victim support and redress", "Youth participation and harm research"],
      },
      prevention: {
        name: "Upstream safeguards",
        short: ["Impact checks", "technical standards"],
        details: ["Pre-launch child-impact assessment", "Clear technical standards and ratings"],
      },
      adaptive: {
        name: "Adaptive governance",
        short: ["Privacy & education", "context-sensitive rules"],
        details: ["Privacy, education and public dialogue", "Context-sensitive rules with creative space"],
      },
    },
  } : {
    id: "opinion-tendencies",
    title: "兩條意見差異與三種可重疊的傾向",
    description: "探索性意見地圖以兩條作答差異軸呈現三種可重疊的柔性取向：救濟與參與、事前防護、彈性治理。圖中不替參與者指定固定陣營。",
    heading: "三種可重疊的傾向，呈現治理重點的差異",
    subtitle: "同一人可能接近多種傾向；半透明區域呈現政策重點，不代表固定身分。",
    xLeft: "較重產品規範與檢核",
    xRight: "較重教育、情境與自由",
    yTop: "較重事後支持與救濟",
    yBottom: "較重事前預防",
    sideHeading: "三種傾向各自較重視什麼",
    sharedLabel: "三種傾向的共同核心",
    shared: "兒少正式參與，以及研究具體傷害",
    profiles: {
      care: {
        name: "救濟與參與",
        short: ["被害人支持", "兒少參與"],
        details: ["被害人協助與事後救濟", "兒少參與及傷害研究"],
      },
      prevention: {
        name: "事前防護",
        short: ["影響評估", "技術標準"],
        details: ["上線前完成兒少影響評估", "建立明確技術標準與分級"],
      },
      adaptive: {
        name: "彈性治理",
        short: ["隱私與教育", "依情境調整"],
        details: ["隱私、教育與社會對話", "依情境調整並保留創作空間"],
      },
    },
  };
  const width = 1440;
  const height = 900;
  const parts = svgStart({
    id: copy.id,
    language: english ? "en" : "zh-Hant-TW",
    width,
    height,
    title: copy.title,
    description: copy.description,
  });
  svgHeader(parts, copy.heading, copy.subtitle);
  parts.push('<line x1="72" x2="1368" y1="150" y2="150" class="grid"/>');

  const plot = { left: 104, right: 918, top: 218, bottom: 678 };
  const contour = opinionContourGeometry(tendencyData.profiles);
  const x = (value) => scale(value, contour.domain.xMinimum, contour.domain.xMaximum, plot.left, plot.right);
  const y = (value) => scale(value, contour.domain.yMinimum, contour.domain.yMaximum, plot.bottom, plot.top);
  const zeroX = x(0);
  const zeroY = y(0);
  parts.push('<line x1="' + plot.left + '" x2="' + plot.right + '" y1="' + zeroY + '" y2="' + zeroY + '" class="axis"/>');
  parts.push('<line x1="' + zeroX + '" x2="' + zeroX + '" y1="' + plot.top + '" y2="' + plot.bottom + '" class="axis"/>');
  parts.push('<text x="' + plot.left + '" y="720" class="tiny">' + escapeXml(copy.xLeft) + '</text>');
  parts.push('<text x="' + plot.right + '" y="720" text-anchor="end" class="tiny">' + escapeXml(copy.xRight) + '</text>');
  parts.push('<text x="' + (zeroX + 12) + '" y="196" class="tiny">' + escapeXml(copy.yTop) + '</text>');
  parts.push('<text x="' + (zeroX + 12) + '" y="704" class="tiny">' + escapeXml(copy.yBottom) + '</text>');

  const colors = { care: PALETTE.violet, prevention: PALETTE.amber, adaptive: PALETTE.agree };
  const labelOffsets = english ? {
    care: [-26, -8], prevention: [-4, 2], adaptive: [24, -8],
  } : {
    care: [-26, -8], prevention: [-2, 2], adaptive: [24, -8],
  };
  contour.geometry.forEach((entry) => {
    const profile = entry.profile;
    const profileCopy = copy.profiles[profile.key];
    const color = colors[profile.key];
    const centerX = x(profile.centroid[0]) + labelOffsets[profile.key][0];
    const centerY = y(profile.centroid[1]) + labelOffsets[profile.key][1];
    parts.push('<path d="' + opinionContourPath(entry, contour.contourScale, contour.domain, plot) + '" fill="' + color + '" fill-opacity="0.17" stroke="' + color + '" stroke-width="2.5"/>');
    parts.push('<circle cx="' + x(profile.centroid[0]) + '" cy="' + y(profile.centroid[1]) + '" r="5" fill="' + color + '"/>');
    parts.push('<text x="' + centerX + '" y="' + centerY + '" text-anchor="middle" class="label">' + escapeXml(profileCopy.name) + '</text>');
    parts.push('<text x="' + centerX + '" y="' + (centerY + 25) + '" text-anchor="middle" class="tiny">' + escapeXml(profileCopy.short.join(english ? " · " : "・")) + '</text>');
  });

  parts.push('<line x1="968" x2="968" y1="188" y2="744" class="grid"/>');
  parts.push('<text x="1010" y="214" class="label">' + escapeXml(copy.sideHeading) + '</text>');
  tendencyData.profiles.forEach((profile, index) => {
    const profileCopy = copy.profiles[profile.key];
    const blockY = 278 + index * 154;
    parts.push('<line x1="1010" x2="1050" y1="' + (blockY - 7) + '" y2="' + (blockY - 7) + '" stroke="' + colors[profile.key] + '" stroke-width="5"/>');
    parts.push('<text x="1070" y="' + blockY + '" class="section">' + escapeXml(profileCopy.name) + '</text>');
    parts.push('<text x="1010" y="' + (blockY + 42) + '" class="compact">' + escapeXml(profileCopy.details[0]) + '</text>');
    parts.push('<text x="1010" y="' + (blockY + 74) + '" class="compact">' + escapeXml(profileCopy.details[1]) + '</text>');
  });
  parts.push('<line x1="72" x2="1368" y1="786" y2="786" class="grid"/>');
  parts.push('<text x="72" y="830" class="label">' + escapeXml(copy.sharedLabel) + '</text>');
  parts.push('<text x="' + (english ? 292 : 310) + '" y="830" class="body">' + escapeXml(copy.shared) + '</text>');
  parts.push('</svg>');
  return parts.join("\n");
}

function buildAggregateTable(metrics) {
  return metrics.map((metric) => (
    '<tr><td class="number">' + (metric.index + 1) + '</td>' +
    '<td>' + escapeHtml(SHORT_LABELS[metric.index]) + '</td>' +
    '<td class="number">' + metric.n + '</td>' +
    '<td class="number">' + pct(metric.coveragePct) + '</td>' +
    '<td class="number support">' + metric.support + '（' + pct(metric.supportPct) + '）</td>' +
    '<td class="number">' + metric.neutral + '（' + pct(metric.neutralPct) + '）</td>' +
    '<td class="number">' + metric.oppose + '（' + pct(metric.opposePct) + '）</td></tr>'
  )).join("\n");
}

function buildPlotInsights(metrics) {
  const strongest = Math.round(metrics[2].supportPct);
  const evidence = Math.round(metrics[7].supportPct);
  const review = Math.round(metrics[14].supportPct);
  const openNeutral = Math.round(metrics[23].neutralPct);
  return '<div class="headline-insights" aria-label="一眼看懂的三個結論">' +
    '<article><span class="insight-label">最強共識</span><strong>' + strongest + '%</strong>' +
    '<span class="insight-meter" role="img" aria-label="' + strongest + '% 支持"><i style="width:' + round(metrics[2].supportPct, 1) + '%"></i></span>' +
    '<p>兒少正式參與政策制定・' + metrics[2].n + ' 人作答</p></article>' +
    '<article><span class="insight-label">實證先行</span><strong>' + evidence + '%</strong>' +
    '<span class="insight-meter" role="img" aria-label="' + evidence + '% 支持研究具體傷害"><i style="width:' + round(metrics[7].supportPct, 1) + '%"></i></span>' +
    '<p>支持釐清具體傷害・' + metrics[7].n + ' 人作答</p>' +
    '<div class="insight-extra"><b>' + review + '%</b><span>支持定期檢討・' + metrics[14].n + ' 人作答（作答較少）</span></div>' +
    '<span class="insight-meter secondary" role="img" aria-label="' + review + '% 支持定期檢討"><i style="width:' + round(metrics[14].supportPct, 1) + '%"></i></span></article>' +
    '<article><span class="insight-label">第 24 題需重問</span><strong>' + openNeutral + '% 選擇中立</strong>' +
    '<span class="insight-meter" role="img" aria-label="第 24 題有 ' + openNeutral + '% 選擇中立"><i style="width:' + round(metrics[23].neutralPct, 1) + '%"></i></span>' +
    '<p>第 24 題是問句，其餘回應不宜解讀為政策支持或反對・' + metrics[23].n + ' 人作答（作答較少）</p></article>' +
    '</div>';
}

function buildMobileVotePatterns(metrics, english) {
  const selectedIndices = [2, 7, 1, 3, 4, 0, 6, 23];
  const labels = english ? [
    "Formal youth role",
    "Research concrete harms",
    "Age boundaries",
    "Parent–child AI safety",
    "Pre-launch impact checks",
    "Victim support first",
    "Prevent expanded surveillance",
    "Can rules keep pace?",
  ] : [
    "兒少正式參與",
    "研究具體傷害",
    "年齡界線",
    "親子 AI 安全教育",
    "上線前影響評估",
    "被害人協助與救濟優先",
    "防止擴張監控",
    "法規能否跟上？",
  ];
  const chartMetrics = selectedIndices.map((index, rowIndex) => ({
    ...metrics[index],
    label: labels[rowIndex],
  }));
  const copy = english ? {
    label: "Response distributions for eight key statements",
    heading: "Broad support, with one open question",
    legend: ["Agree", "Neutral", "Disagree"],
    n: "n = ",
    note: "Ordered by agreement. Agree combines strongly agree and agree; response counts differ. Statement 24 is a question.",
    aria: (metric) => metric.label + ": agree " + pct(metric.supportPct) +
      ", neutral " + pct(metric.neutralPct) + ", disagree " + pct(metric.opposePct) +
      ", " + metric.n + " responses",
  } : {
    label: "八項關鍵陳述的回應分布",
    heading: "多數有共識，一題仍待釐清",
    legend: ["同意", "中立", "不同意"],
    n: "n＝",
    note: "依同意比例排序；同意包含非常同意與同意，各題作答人數不同。第 24 題是問句。",
    aria: (metric) => metric.label + "：同意 " + pct(metric.supportPct) +
      "、中立 " + pct(metric.neutralPct) + "、不同意 " + pct(metric.opposePct) +
      "，共 " + metric.n + " 人作答",
  };
  const segment = (className, value, alwaysLabel = false) => (
    '<span class="' + className + '" style="width:' + round(value, 1) + '%">' +
    (alwaysLabel || value >= 11.5 ? '<b>' + Math.round(value) + '%</b>' : '') + '</span>'
  );
  return '<div class="mobile-chart mobile-votes" role="group" aria-label="' + escapeHtml(copy.label) + '">' +
    '<div class="mobile-vote-legend" aria-hidden="true"><span><i class="support"></i>' + escapeHtml(copy.legend[0]) +
    '</span><span><i class="neutral"></i>' + escapeHtml(copy.legend[1]) +
    '</span><span><i class="oppose"></i>' + escapeHtml(copy.legend[2]) + '</span></div>' +
    '<div class="mobile-vote-list">' + chartMetrics.map((metric) => (
      '<article><div class="mobile-vote-label"><strong>' + escapeHtml(metric.label) + '</strong><span>' +
      escapeHtml(copy.n + metric.n) + '</span></div><div class="mobile-vote-bar" role="img" aria-label="' +
      escapeHtml(copy.aria(metric)) + '">' + segment("support", metric.supportPct, true) +
      segment("neutral", metric.neutralPct) + segment("oppose", metric.opposePct) + '</div></article>'
    )).join("") + '</div><p class="mobile-vote-note">' + escapeHtml(copy.note) + '</p></div>';
}

function buildMobileThemeSummary(metrics, english) {
  const rows = english ? [
    { title: "Education", percent: Math.round(metrics[3].supportPct), sample: "Parent–child safety education · n = " + metrics[3].n, body: "Build practical AI safety skills at home and school" },
    { title: "Age + context", percent: 67, sample: "Supported both statements · n = 36", body: "Use age as a baseline, but not the only criterion" },
    { title: "Impact assessment", percent: Math.round(metrics[4].supportPct), sample: "Pre-launch assessment · n = " + metrics[4].n, body: "Check impacts on children before products launch" },
    { title: "Victim support", percent: Math.round(metrics[0].supportPct), sample: "Victim support first · n = " + metrics[0].n, body: "Provide victim support and routes to redress" },
    { title: "Rights safeguards", percent: Math.round(metrics[6].supportPct), sample: "Prevent expanded surveillance · n = " + metrics[6].n, body: "Prevent expanded surveillance and protect privacy" },
  ] : [
    { title: "安全教育", percent: Math.round(metrics[3].supportPct), sample: "親子 AI 安全教育・" + metrics[3].n + " 人作答", body: "在家庭與學校培養 AI 安全素養" },
    { title: "分齡＋情境", percent: 67, sample: "兩項主張都支持・36 人共同作答", body: "年齡作為基本界線，同時納入情境判斷" },
    { title: "影響評估", percent: Math.round(metrics[4].supportPct), sample: "產品上線前評估・" + metrics[4].n + " 人作答", body: "推出產品前先評估對兒少的影響" },
    { title: "協助與救濟", percent: Math.round(metrics[0].supportPct), sample: "被害人協助與救濟優先・" + metrics[0].n + " 人作答", body: "建立被害人協助與救濟路徑" },
    { title: "權利保障", percent: Math.round(metrics[6].supportPct), sample: "防止擴張監控・" + metrics[6].n + " 人作答", body: "防止擴張監控並保障個人隱私" },
  ];
  const principles = english ? [
    { label: "Youth participation", percent: Math.round(metrics[2].supportPct), sample: "n = " + metrics[2].n, meaning: "A formal role in policy design and review" },
    { label: "Evidence on harm", percent: Math.round(metrics[7].supportPct), sample: "n = " + metrics[7].n, meaning: "Use concrete evidence to calibrate intervention" },
    { label: "Review and adapt", percent: Math.round(metrics[14].supportPct), sample: "n = " + metrics[14].n + " · fewer responses", meaning: "Review regularly as evidence changes" },
  ] : [
    { label: "讓兒少正式參與", percent: Math.round(metrics[2].supportPct), sample: metrics[2].n + " 人作答", meaning: "從政策設計到後續檢討，都有正式參與管道" },
    { label: "先釐清傷害樣態", percent: Math.round(metrics[7].supportPct), sample: metrics[7].n + " 人作答", meaning: "用具體證據決定介入方式與強度" },
    { label: "定期檢討、持續調整", percent: Math.round(metrics[14].supportPct), sample: metrics[14].n + " 人作答・作答較少", meaning: "隨技術、情境與新證據修正制度" },
  ];
  const label = english ? "Mobile summary of the shared policy direction" : "共同治理方向行動摘要";
  const heading = english ? "Three principles point to five action areas" : "三項原則，帶出五個實作方向";
  const principleHeading = english ? "Three strongly supported principles" : "三項高支持原則";
  return '<div class="mobile-chart mobile-theme" role="group" aria-label="' + escapeHtml(label) + '">' +
    '<div class="mobile-principle"><strong class="mobile-principle-heading">' + escapeHtml(principleHeading) + '</strong>' +
    principles.map((principle) => (
      '<div class="mobile-principle-row"><span><b>' + escapeHtml(principle.label) + '</b><small>' + escapeHtml(principle.sample) + '</small></span>' +
      '<strong>' + principle.percent + '%</strong><i role="img" aria-label="' + escapeHtml(principle.label + " " + principle.percent + "%") + '"><b style="width:' + principle.percent + '%"></b></i>' +
      '<p class="mobile-principle-meaning">' + escapeHtml(principle.meaning) + '</p></div>'
    )).join("") + '</div>' +
    '<ul class="mobile-chart-list">' + rows.map((row) => (
      '<li><strong>' + escapeHtml(row.title) + '</strong><span>' + row.percent + '%</span>' +
      '<span class="mobile-theme-meter" role="img" aria-label="' + escapeHtml(row.title + " " + row.percent + "%") + '"><b style="width:' + row.percent + '%"></b></span>' +
      '<p>' + escapeHtml(row.body + " · " + row.sample) + '</p></li>'
    )).join("") + '</ul></div>';
}

function buildMobileTensionSummary({ tensionOverlaps }, english) {
  const rows = english ? [
    { title: "Prevention and redress", left: "A · Impact assessment", right: "B · Victim support and redress" },
    { title: "Age boundaries and context", left: "A · Age boundaries", right: "B · Context matters" },
    { title: "Limit surveillance and protect creative freedom", left: "A · Limit surveillance", right: "B · Creative freedom" },
  ] : [
    { title: "事前影響評估與事後救濟", left: "A・影響評估", right: "B・被害人協助與救濟" },
    { title: "年齡界線與情境判斷", left: "A・年齡界線", right: "B・情境判斷" },
    { title: "防止擴張監控與保障創作自由", left: "A・限制監控", right: "B・創作自由" },
  ];
  const label = english ? "Venn diagrams of support for three paired policy priorities" : "三組政策主張的支持重疊圖";
  const note = english
    ? "Circle areas are proportional within each pair. Only people who answered both statements are counted."
    : "每組內的圓面積依人數比例繪製；只計兩題皆有作答者。";
  assert(rows.length === tensionOverlaps.length, "Mobile tension copy does not match overlap data.");
  return '<div class="mobile-chart mobile-tensions" role="group" aria-label="' + escapeHtml(label) + '">' +
    rows.map((row, index) => {
      const overlap = tensionOverlaps[index];
      const layout = buildVennLayout(overlap, 62, 160);
      const aria = (english ? "Both " : "兩項都支持 ") + pct(overlap.percentages.both) +
        (english ? ", A only " : "，只支持 A ") + pct(overlap.percentages.leftOnly) +
        (english ? ", B only " : "，只支持 B ") + pct(overlap.percentages.rightOnly) +
        (english ? ", neither " : "，兩項都未支持 ") + pct(overlap.percentages.neither);
      const outside = overlap.counts.neither
        ? (english ? "Outside both: " : "兩項都未支持：") + pct(overlap.percentages.neither) + " · " + overlap.counts.neither + (english ? " people" : " 人")
        : (english ? "Everyone supported at least one option" : "所有人至少支持一項");
      return '<article><strong class="mobile-tension-title">' + escapeHtml(row.title) + '</strong>' +
        '<div class="mobile-tension-sides"><span>' + escapeHtml(row.left) + '</span><span>' + escapeHtml(row.right) + '</span></div>' +
        '<svg class="mobile-venn" viewBox="0 0 320 190" role="img" aria-label="' + escapeHtml(aria) + '">' +
        '<circle class="venn-circle-a" cx="' + round(layout.circleAX, 2) + '" cy="92" r="' + round(layout.radiusA, 2) + '"></circle>' +
        '<circle class="venn-circle-b" cx="' + round(layout.circleBX, 2) + '" cy="92" r="' + round(layout.radiusB, 2) + '"></circle>' +
        '<text class="venn-both-label" x="' + round(layout.overlapX, 2) + '" y="80" text-anchor="middle">' + escapeXml(english ? "BOTH" : "兩項都支持") + '</text>' +
        '<text class="venn-both-value" x="' + round(layout.overlapX, 2) + '" y="111" text-anchor="middle">' + pct(overlap.percentages.both) + '</text>' +
        '</svg><div class="mobile-venn-side-stats"><span>' + escapeHtml(english ? "A only " : "只支持 A ") + '<b>' + pct(overlap.percentages.leftOnly) + '</b></span><span>' + escapeHtml(english ? "B only " : "只支持 B ") + '<b>' + pct(overlap.percentages.rightOnly) + '</b></span></div><p class="mobile-venn-outside">' + escapeHtml(outside) + '</p>' +
        '<small>' + escapeHtml(english ? "Answered both: " + overlap.jointN : "兩題皆有作答：" + overlap.jointN + " 人") + '</small></article>';
    }).join("") + '<p class="mobile-overlap-note">' + escapeHtml(note) + '</p></div>';
}

function buildMobileCoverageSummary(english) {
  const rows = english ? [
    { label: "First 8", value: "60.5", width: 100 },
    { label: "Middle 8", value: "38.8", width: 64 },
    { label: "Final 8", value: "29.3", width: 48 },
  ] : [
    { label: "前 8 題", value: "60.5", width: 100 },
    { label: "中 8 題", value: "38.8", width: 64 },
    { label: "後 8 題", value: "29.3", width: 48 },
  ];
  const label = english ? "Mobile summary of response coverage" : "作答覆蓋變化摘要";
  const heading = english ? "Responses fell from 69 to 23" : "作答人數從 69 人降至 23 人";
  const unit = english ? "average responses" : "平均作答人數";
  return '<div class="mobile-chart mobile-coverage" role="group" aria-label="' + escapeHtml(label) + '">' +
    '<span class="mobile-coverage-unit">' + escapeHtml(unit) + '</span>' +
    rows.map((row) => (
      '<div class="mobile-coverage-row"><span>' + escapeHtml(row.label) + '</span><i aria-hidden="true"><b style="width:' + row.width + '%"></b></i><strong>' + escapeHtml(row.value) + '</strong></div>'
    )).join("") + '</div>';
}

function buildMobilePauseSummary(metrics, voterCount, english) {
  const selected = highestNeutralMetrics(metrics);
  const labels = english ? EN_SHORT_LABELS : SHORT_LABELS;
  const lowReachThreshold = Math.ceil(voterCount * LOW_REACH_SHARE);
  const label = english ? "Mobile summary of statements with the highest neutral shares" : "中立比例最高題目摘要";
  const heading = english ? "Higher-neutral statements need follow-up" : "哪些題目較多人選擇中立？";
  const note = english
    ? "Reasons for neutral responses were not measured. † Statement 24 was phrased as a question."
    : "本次資料無法判斷選擇中立的原因。† 第 24 題是問句，不能直接解讀為政策支持／反對。";
  return '<div class="mobile-chart mobile-pause" role="group" aria-label="' + escapeHtml(label) + '">' +
    selected.map((metric) => {
      const statementLabel = labels[metric.index] + (metric.index === 23 ? "†" : "");
      const lowReach = metric.n < lowReachThreshold;
      const meterWidth = Math.min(100, 100 * metric.neutralPct / 50);
      return '<article><div class="mobile-pause-head"><span>#' + (metric.index + 1) + ' ' + escapeHtml(statementLabel) + '</span><strong>' + pct(metric.neutralPct) + '</strong></div>' +
        '<i class="mobile-pause-meter" role="img" aria-label="' + escapeHtml(pct(metric.neutralPct) + (english ? " neutral" : " 中立")) + '"><b style="width:' + round(meterWidth, 1) + '%"></b></i>' +
        '<div class="mobile-pause-meta"><span>' + escapeHtml(english ? "n = " + metric.n : metric.n + " 人作答") + '</span>' +
        (lowReach ? '<em>' + escapeHtml(english ? "FEWER RESPONSES" : "作答較少") + '</em>' : '') + '</div></article>';
    }).join("") + '<p>' + escapeHtml(note) + '</p></div>';
}

function buildMobileOpinionGroupsSummary(groupAnalysis, english) {
  const publishable = groupAnalysis.status === "publishable";
  const unavailable = groupAnalysis.status === "unavailable";
  const stability = Number.isFinite(groupAnalysis.bootstrapMedianAri)
    ? groupAnalysis.bootstrapMedianAri
    : 0;
  const stabilityThreshold = groupAnalysis.thresholds.minBootstrapMedianAri;
  const smallestGroup = groupAnalysis.groupSizes.length ? Math.min(...groupAnalysis.groupSizes) : null;
  const kValues = [2, 3, 4, 5];
  const frequencies = kValues.map((k) => ({ k, count: Number(groupAnalysis.bootstrapSelectedKFrequency[String(k)] || 0) }));
  const completed = groupAnalysis.bootstrapReplicates || frequencies.reduce((sum, entry) => sum + entry.count, 0);
  const gridAria = frequencies.map((entry) => "K=" + entry.k + " " + entry.count).join(", ");
  const copy = english ? {
    label: "Reliability check for Pol.is-inspired opinion groups",
    heading: publishable ? "Groups remained stable across reruns" : unavailable ? "Not enough shared data" : "100 reruns did not agree",
    status: publishable ? "Publishable" : unavailable ? "Unavailable" : "Withheld",
    reruns: "Each square is one rerun; colour shows the selected K.",
    sameK: Number(groupAnalysis.bootstrapSelectedKFrequency[String(groupAnalysis.selectedK)] || 0) + " of " + completed + " selected K=" + groupAnalysis.selectedK,
    stability: "Membership stability",
    threshold: "threshold " + stabilityThreshold.toFixed(2),
    passed: groupAnalysis.bootstrapPassCount + " of " + completed + " reached the threshold",
    note: publishable
      ? "Group comparisons may be shown with neutral labels."
      : unavailable
        ? "More overlapping responses are needed before clustering."
        : "Stability was " + stability.toFixed(2) + " and the smallest group had " + (smallestGroup ?? "too few") + " people; groups are withheld.",
  } : {
    label: "類 Pol.is 觀點群組可靠度檢核",
    heading: publishable ? "重跑後仍形成穩定分群" : unavailable ? "共同資料不足" : "100 次重跑沒有一致結果",
    status: publishable ? "可發布" : unavailable ? "資料不足" : "暫不發布",
    reruns: "每格代表一次重跑；顏色代表選出的 K。",
    sameK: completed + " 次中有 " + Number(groupAnalysis.bootstrapSelectedKFrequency[String(groupAnalysis.selectedK)] || 0) + " 次選出 K＝" + groupAnalysis.selectedK,
    stability: "成員穩定度",
    threshold: "門檻 " + stabilityThreshold.toFixed(2),
    passed: completed + " 次中有 " + groupAnalysis.bootstrapPassCount + " 次達到門檻",
    note: publishable
      ? "可以用中性名稱呈現群組比較。"
      : unavailable
        ? "需要更多人回答相同題目，再進行分群。"
        : "成員穩定度僅 " + stability.toFixed(2) + "，且最小群組僅 " + (smallestGroup ?? "少數") + " 人；因此暫不發布群組。",
  };
  return '<div class="mobile-chart mobile-groups" role="group" aria-label="' + escapeHtml(copy.label) + '">' +
    '<div class="mobile-group-head"><h3 class="mobile-chart-head">' + escapeHtml(copy.heading) + '</h3><span>' + escapeHtml(copy.status) + '</span></div>' +
    (unavailable ? '' : '<p class="mobile-rerun-intro">' + escapeHtml(copy.reruns) + '</p>' +
      '<div class="mobile-rerun-grid" role="img" aria-label="' + escapeHtml(gridAria) + '">' + (groupAnalysis.bootstrapRuns || []).map((run) => (
        '<i class="rerun-k' + run.selectedK + (run.adjustedRand >= stabilityThreshold ? ' rerun-passed' : '') + '" aria-hidden="true"></i>'
      )).join("") + '</div>' +
      '<div class="mobile-rerun-legend">' + frequencies.map((entry) => '<span><i class="rerun-k' + entry.k + '" aria-hidden="true"></i>K=' + entry.k + ' · ' + entry.count + '</span>').join("") + '</div>' +
      '<small class="mobile-rerun-same">' + escapeHtml(copy.sameK) + '</small>' +
      '<div class="mobile-group-row"><div><span>' + escapeHtml(copy.stability) + '</span><strong>' + stability.toFixed(2) + '</strong></div>' +
      '<small class="mobile-group-meta">' + escapeHtml(copy.threshold + " · " + copy.passed) + '</small>' +
      '<i role="img" aria-label="' + escapeHtml(copy.stability + " " + stability.toFixed(2)) + '"><b class="group-meter-2" style="width:' + round(100 * Math.max(0, Math.min(1, stability)), 1) + '%"></b></i></div>') +
    '<p>' + escapeHtml(copy.note) + '</p></div>';
}

function buildMobileOpinionLandscapeSummary(groupAnalysis, english) {
  const tendencyData = groupAnalysis.opinionTendencies;
  assert(tendencyData.available && tendencyData.profiles.length === 3, "Three mobile opinion tendencies are required.");
  const copy = english ? {
    label: "Three overlapping opinion tendencies on two dimensions",
    left: "Rules & checks",
    right: "Education, context & liberty",
    top: "Support after harm",
    bottom: "Prevention before harm",
    profiles: {
      care: { name: "Care & participation", detail: "Emphasises victim support, redress and formal youth participation." },
      prevention: { name: "Upstream safeguards", detail: "Emphasises impact assessment, technical standards and content ratings." },
      adaptive: { name: "Adaptive governance", detail: "Emphasises privacy, education, dialogue and context-sensitive rules." },
    },
    sharedLabel: "Shared core",
    shared: "All three strongly support formal youth participation and research into concrete harms.",
  } : {
    label: "兩條差異軸上的三種可重疊意見傾向",
    left: "規範與檢核",
    right: "教育、情境與自由",
    top: "事後支持",
    bottom: "事前預防",
    profiles: {
      care: { name: "救濟與參與", detail: "較重視被害人協助、事後救濟與兒少正式參與。" },
      prevention: { name: "事前防護", detail: "較重視影響評估、技術標準與內容分級。" },
      adaptive: { name: "彈性治理", detail: "較重視隱私、教育、社會對話與情境調整。" },
    },
    sharedLabel: "共同核心",
    shared: "三種傾向都高度支持兒少正式參與，以及研究具體傷害。",
  };
  const plot = { left: 42, right: 318, top: 36, bottom: 212 };
  const contour = opinionContourGeometry(tendencyData.profiles);
  const x = (value) => scale(value, contour.domain.xMinimum, contour.domain.xMaximum, plot.left, plot.right);
  const y = (value) => scale(value, contour.domain.yMinimum, contour.domain.yMaximum, plot.bottom, plot.top);
  const colors = { care: PALETTE.violet, prevention: PALETTE.amber, adaptive: PALETTE.agree };
  const map = '<svg class="mobile-tendency-map" viewBox="0 0 360 260" role="img" aria-label="' + escapeHtml(copy.label) + '">' +
    '<line x1="' + plot.left + '" x2="' + plot.right + '" y1="' + y(0) + '" y2="' + y(0) + '" class="mobile-tendency-axis"/>' +
    '<line x1="' + x(0) + '" x2="' + x(0) + '" y1="' + plot.top + '" y2="' + plot.bottom + '" class="mobile-tendency-axis"/>' +
    contour.geometry.map((entry) => {
      const profile = entry.profile;
      return '<path d="' + opinionContourPath(entry, contour.contourScale, contour.domain, plot) + '" fill="' + colors[profile.key] + '" fill-opacity="0.18" stroke="' + colors[profile.key] + '" stroke-width="1.5"/>' +
        '<circle cx="' + x(profile.centroid[0]) + '" cy="' + y(profile.centroid[1]) + '" r="2.5" fill="' + colors[profile.key] + '"/>' +
        '<text x="' + x(profile.centroid[0]) + '" y="' + (y(profile.centroid[1]) - 7) + '" text-anchor="middle" class="mobile-tendency-name">' + escapeHtml(copy.profiles[profile.key].name) + '</text>';
    }).join("") +
    '<text x="' + plot.left + '" y="238" class="mobile-tendency-end">' + escapeHtml(copy.left) + '</text>' +
    '<text x="' + plot.right + '" y="238" text-anchor="end" class="mobile-tendency-end">' + escapeHtml(copy.right) + '</text>' +
    '<text x="' + (x(0) + 6) + '" y="18" class="mobile-tendency-end">' + escapeHtml(copy.top) + '</text>' +
    '<text x="' + (x(0) + 6) + '" y="256" class="mobile-tendency-end">' + escapeHtml(copy.bottom) + '</text>' +
    '</svg>';
  const profileRows = tendencyData.profiles.map((profile) => (
    '<article class="mobile-tendency-profile"><i style="background:' + colors[profile.key] + '"></i><div><strong>' +
    escapeHtml(copy.profiles[profile.key].name) + '</strong><p>' + escapeHtml(copy.profiles[profile.key].detail) + '</p></div></article>'
  )).join("");
  return '<div class="mobile-chart mobile-tendencies" role="group" aria-label="' + escapeHtml(copy.label) + '">' +
    map + profileRows + '<p class="mobile-tendency-shared"><b>' + escapeHtml(copy.sharedLabel) + '</b>' + escapeHtml(copy.shared) + '</p></div>';
}

function buildAnalysisMethodHtml({ groupAnalysis, voterCount, totals }, english) {
  const stability = Number.isFinite(groupAnalysis.bootstrapMedianAri)
    ? groupAnalysis.bootstrapMedianAri.toFixed(2)
    : "—";
  const explained = Number.isFinite(groupAnalysis.explainedVariancePct)
    ? pct(groupAnalysis.explainedVariancePct)
    : "—";
  const steps = english ? [
    {
      title: "Prepare and validate the data",
      text: "We checked that each participant had at most one response to each prompt and that every response used a valid scale option. The final dataset contains " + voterCount + " participants with votes, 24 prompts and " + totals.responses.toLocaleString("en-GB") + " responses. Names and identifiers are excluded from the report.",
      meaning: "This establishes what was analysed and prevents duplicate votes from changing the results.",
    },
    {
      title: "Calculate each prompt’s result",
      text: "Agreement combines ‘strongly agree’ and ‘agree’; disagreement combines the two disagreement options. Percentages use only the people who answered that prompt. An unanswered prompt remains missing and is never counted as neutral. Coverage is the number who answered divided by all " + voterCount + " participants with votes.",
      meaning: "Different prompts have different denominators, so later low-response prompts carry less evidence.",
    },
    {
      title: "Organise statements into themes and principles",
      text: "We compared the wording and response patterns, then grouped related statements into principles and action areas. These labels are an analyst-created synthesis; they are not an additional vote or an automated topic model. Every percentage shown still belongs to its original prompt.",
      meaning: "The themes help readers connect individual statements without inventing a new score.",
    },
    {
      title: "Measure support for paired priorities",
      text: "For each Venn diagram, we included only people who answered both prompts. A person enters the overlap when they agreed with both. Neutral and disagreement count as ‘not supported’ for this comparison. Circle areas are proportional to the four observed combinations: both, A only, B only and neither.",
      meaning: "The overlap shows whether the same respondents combined two priorities; it does not show cause or intensity.",
    },
    {
      title: "Find the main opinion dimensions",
      text: "For this step, responses are encoded as agree (+1), neutral (0) and disagree (−1), while missing remains separate. PCA uses all " + (groupAnalysis.eligibleParticipants + groupAnalysis.excludedParticipants) + " voters to find the two strongest response gradients. Missing cells use each prompt’s observed average only while fitting the axes; personal positions use answered prompts and are adjusted for response count. The two axes explain " + explained + " of the observed variation.",
      meaning: "Axis names are plain-language interpretations of the statements with the strongest PCA contributions; the map is a summary of part of the variation.",
    },
    {
      title: "Describe overlapping opinion tendencies",
      text: groupAnalysis.status === "unavailable"
        ? "There were not enough people with overlapping answers to estimate opinion tendencies."
        : groupAnalysis.eligibleParticipants + " people who answered at least " + groupAnalysis.minimumVotes + " prompts entered a three-profile fuzzy c-means analysis; " + groupAnalysis.excludedParticipants + " people did not meet that threshold. Each person receives weights across all three profiles rather than one fixed assignment. Profile positions are weighted centres, and the shaded regions show weighted spread. The regions are enlarged slightly for readability and are not confidence intervals.",
      meaning: "Three profiles were chosen to keep the public map readable. Their names describe relative emphasis in this session and should not be treated as permanent identities.",
    },
    {
      title: "Check uncertainty and limit the claims",
      text: "Separately, we tested fixed K-means partitions with two to five groups and resampled the prompts 100 times. Median repeatability was " + stability + "; " + groupAnalysis.bootstrapPassCount + " runs reached the report’s " + groupAnalysis.thresholds.minBootstrapMedianAri.toFixed(2) + " publication guardrail. We therefore publish overlapping tendencies, not participant camps. The analysis is Pol.is-inspired offline work, not official Pol.is output.",
      meaning: "No individual coordinates, profile weights or group assignments are published. Results describe this session and are not representative of everyone in Taiwan. Response counts fall from 69 to 23, no one selected ‘strongly disagree’, and Q24 is a question that does not fit the agreement scale, so those results require extra caution.",
    },
  ] : [
    {
      title: "整理並檢查資料",
      text: "先確認每位參與者對每一題最多只有一筆回應，所有回應也都使用有效選項。最後納入 " + voterCount + " 位有投票紀錄者、24 題與 " + totals.responses.toLocaleString("zh-TW") + " 筆回應。報告不包含姓名或識別碼。",
      meaning: "這一步界定分析範圍，也避免重複投票改變結果。",
    },
    {
      title: "計算每一題的結果",
      text: "「非常同意」與「同意」合併為同意，兩種不同意選項也合併計算。每題百分比只以該題實際作答者為分母。未作答維持缺值，不會被算成中立；覆蓋率則是作答人數除以全部 " + voterCount + " 位有投票紀錄者。",
      meaning: "每題分母可能不同；後段題目作答較少，能支持的判斷也較有限。",
    },
    {
      title: "整理主題、原則與行動面向",
      text: "分析會比較題目內容與作答分布，再把相關主張整理成原則與行動面向。這些名稱是分析者為協助閱讀所做的歸納，沒有新增一輪投票，也沒有使用自動主題模型。圖上的每個百分比仍對應原本題目。",
      meaning: "主題整理用來連結分散的主張，不會另外創造新的分數。",
    },
    {
      title: "檢查兩項政策是否被同時支持",
      text: "每張文氏圖只納入兩題都有作答者；同一人對兩題都選擇同意，才會進入重疊區。中立與不同意在這項比較中都列為未支持。圓形面積依四種實際組合繪製：兩項都支持、只支持 A、只支持 B、兩項都未支持。",
      meaning: "重疊區顯示同一批作答者如何組合兩項主張，無法推論因果或支持強度。",
    },
    {
      title: "找出意見的主要差異軸",
      text: "這一步把同意編為 +1、中立編為 0、不同意編為 −1，未作答仍另行處理。PCA 使用全部 " + (groupAnalysis.eligibleParticipants + groupAnalysis.excludedParticipants) + " 位有投票紀錄者，找出兩條最主要的作答差異。估算差異軸時，缺值暫以該題已作答者的平均值補上；計算個人位置時只使用實際作答題目，並依作答題數校正。兩條軸合計解釋 " + explained + " 的資料差異。",
      meaning: "差異軸的名稱，是依貢獻最大的題目所做的白話解讀；這張圖濃縮部分差異，沒有涵蓋所有意見。",
    },
    {
      title: "描述可重疊的意見傾向",
      text: groupAnalysis.status === "unavailable"
        ? "共同作答資料不足，無法估算意見傾向。"
        : "至少回答 " + groupAnalysis.minimumVotes + " 題的 " + groupAnalysis.eligibleParticipants + " 人進入三種取向的柔性 c-means 分析，另有 " + groupAnalysis.excludedParticipants + " 人未達門檻。每個人會同時取得三種取向的不同權重，不會被固定分到單一群組。圖中位置是加權中心，半透明區域呈現加權分布；為了方便閱讀，區域稍微放大，也不代表信賴區間。",
      meaning: "三種取向是為了讓公開地圖保持清楚所做的分析選擇；名稱描述本場相對重視的方向，不代表固定身分。",
    },
    {
      title: "檢查不確定性並限制結論",
      text: "另以硬式 k-means 測試 2 至 5 個固定群組，再重新抽樣題目 100 次。分群重現度中位數為 " + stability + "，其中 " + groupAnalysis.bootstrapPassCount + " 次達到本報告設定的 " + groupAnalysis.thresholds.minBootstrapMedianAri.toFixed(2) + " 發布門檻。因此主報告呈現可重疊傾向，不公布參與者陣營。這是參考 Pol.is 的離線分析，並非 Pol.is 官方輸出。",
      meaning: "報告不公布個人座標、取向權重或分群歸屬；結果只描述本場參與者，不能代表全體台灣民眾。各題作答人數從 69 人降至 23 人，沒有人選擇「非常不同意」，第 24 題的問句形式也不適合同意量表，因此需要格外審慎。",
    },
  ];
  const intro = english
    ? "Open this section when you want to see how the raw responses became each chart and conclusion."
    : "想知道原始回應如何變成圖表與結論時，可依序查看以下七個步驟。";
  const meaningLabel = english ? "How to interpret it" : "如何解讀";
  return '<div class="detail-body methodology"><p class="methodology-intro">' + escapeHtml(intro) + '</p><ol class="method-steps">' +
    steps.map((step, index) => '<li class="method-step"><span class="method-step-number">' + String(index + 1).padStart(2, "0") + '</span><div><h3>' +
      escapeHtml(step.title) + '</h3><p>' + escapeHtml(step.text) + '</p><p class="method-step-meaning"><b>' + escapeHtml(meaningLabel) + '</b>' +
      escapeHtml(step.meaning) + '</p></div></li>').join("") + '</ol></div>';
}

function buildFigureNotes({ howLabel, how, takeawayLabel, takeaway }) {
  return '<figcaption class="figure-notes"><span><b>' + escapeHtml(howLabel) + '</b>' + escapeHtml(how) +
    '</span><span><b>' + escapeHtml(takeawayLabel) + '</b>' + escapeHtml(takeaway) + '</span></figcaption>';
}

function buildImplicationsHtml({ metrics, tensionOverlaps }, english) {
  const ageAndContext = tensionOverlaps[1];
  const preventionAndRedress = tensionOverlaps[0];
  const rows = english ? [
    {
      title: "Make youth participation structural",
      evidence: Math.round(metrics[2].supportPct) + "% agreed · n = " + metrics[2].n,
      action: "Give children and young people a formal role in policy design, implementation and later review—not a one-off consultation.",
    },
    {
      title: "Build evidence and review into the policy cycle",
      evidence: Math.round(metrics[7].supportPct) + "% backed harm research; " + Math.round(metrics[14].supportPct) + "% backed regular review · n = " + metrics[7].n + " and " + metrics[14].n,
      action: "Define the harms being addressed, connect intervention strength to evidence, and schedule regular reassessment as technology changes.",
    },
    {
      title: "Design policy packages, not forced choices",
      evidence: Math.round(ageAndContext.percentages.both) + "% backed both age boundaries and context; " + Math.round(preventionAndRedress.percentages.both) + "% backed both prevention and redress among joint respondents",
      action: "Combine age with context and risk, and pair upstream safeguards with victim support and routes to redress.",
    },
    {
      title: "Improve the evidence before deciding the edge cases",
      evidence: "Responses fell from " + metrics[0].n + " to " + metrics[23].n + "; Q24 was " + Math.round(metrics[23].neutralPct) + "% neutral",
      action: "Rewrite Q24, revisit the later prompts, and broaden participation before treating these results as a final policy mandate.",
    },
  ] : [
    {
      title: "建立長期、制度化的兒少參與",
      evidence: Math.round(metrics[2].supportPct) + "% 同意・" + metrics[2].n + " 人作答",
      action: "讓兒少從政策設計、執行到後續檢討都有正式參與管道。",
    },
    {
      title: "讓實證與定期檢討進入政策循環",
      evidence: Math.round(metrics[7].supportPct) + "% 支持研究具體傷害；" + Math.round(metrics[14].supportPct) + "% 支持定期檢討・分別有 " + metrics[7].n + "、" + metrics[14].n + " 人作答",
      action: "先界定要處理的傷害，再依證據決定介入強度，並隨技術與情境變化定期重估。",
    },
    {
      title: "用成套設計取代二選一",
      evidence: Math.round(ageAndContext.percentages.both) + "% 同時支持年齡界線與情境判斷；共同作答者中有 " + Math.round(preventionAndRedress.percentages.both) + "% 同時支持事前預防與事後救濟",
      action: "把分齡與內容、情境、風險一起考量，也把上游防護與被害人協助、救濟路徑一起設計。",
    },
    {
      title: "先補強資料，再決定爭議邊界",
      evidence: "作答人數從 " + metrics[0].n + " 人降至 " + metrics[23].n + " 人；第 24 題有 " + Math.round(metrics[23].neutralPct) + "% 選擇中立",
      action: "改寫第 24 題、補問後段主張並擴大參與，再判斷這些結果是否足以支撐最終政策決定。",
    },
  ];
  return '<ol class="implication-list">' + rows.map((row, index) => (
    '<li><span class="implication-number">' + String(index + 1).padStart(2, "0") + '</span><div>' +
    '<h3>' + escapeHtml(row.title) + '</h3><p class="implication-evidence">' + escapeHtml(row.evidence) + '</p>' +
    '<p>' + escapeHtml(row.action) + '</p></div></li>'
  )).join("") + '</ol>';
}

function buildDotKey(metrics) {
  const groups = [
    { title: "較高覆蓋（75%以上）", filter: (metric) => metric.coveragePct >= 75 },
    { title: "中等覆蓋（50–74%）", filter: (metric) => metric.coveragePct >= 50 && metric.coveragePct < 75 },
    { title: "較低覆蓋（低於50%）", filter: (metric) => metric.coveragePct < 50 },
  ];
  const groupHtml = groups.map((group) => {
    const items = metrics.filter(group.filter).map((metric) => (
      '<li class="dot-key-item" id="statement-' + (metric.index + 1) + '">' +
      '<span class="dot-index">' + String(metric.index + 1).padStart(2, "0") + '</span>' +
      '<div><strong>' + escapeHtml(SHORT_LABELS[metric.index]) + '</strong>' +
      '<small>支持 ' + pct(metric.supportPct) + '・覆蓋 ' + pct(metric.coveragePct) + '・n＝' + metric.n + '</small></div></li>'
    )).join("");
    return '<section class="dot-key-group"><h4>' + group.title + '</h4><ul class="dot-key-list">' + items + '</ul></section>';
  }).join("");
  return '<div class="dot-key"><div class="dot-key-head"><h3>圓點對照：24 項陳述</h3>' +
    '<p>題號依陳述出現順序，僅供對照，與名次無關。先看所在位置，再看該題的支持率、覆蓋率與作答人數。</p></div>' +
    '<div class="dot-key-groups">' + groupHtml + '</div></div>';
}

function buildReportHtml({ topic, sessionId, voterCount, totals, metrics, tensionOverlaps, groupAnalysis, svgs, sessionCreatedDate, dataExtractedDate, generatedDate }, language = "zh") {
  const english = language === "en";
  const copy = english ? {
    htmlLang: "en",
    pageTitle: "AI safety governance | Deliberation analysis",
    nav: '<nav class="language-nav" aria-label="Language"><a href="../index.html" hreflang="zh-Hant-TW">Traditional Chinese</a></nav>',
    eyebrow: "Deliberation analysis · Session ",
    topicLabel: "Topic",
    heroTitle: "The common ground is an adaptable policy mix—not a single ban",
    lead: "Among those who responded, the clearest directions were to involve children and young people, build evidence on concrete harms, and combine safeguards with support. Several apparent trade-offs were supported together.",
    participants: "participants with votes",
    statements: "prompts",
    responses: "responses",
    aggregate: "Aggregate only",
    patternsKicker: "01 · Common ground",
    howLabel: "How to read: ",
    takeawayLabel: "Why it matters: ",
    patternsHeading: "Common ground is about how policy should work—not one preferred ban",
    patternsIntro: "Participants most clearly backed formal youth involvement and evidence on concrete harm. These are agreements about governing well, not a mandate for one regulatory instrument.",
    patternsHow: "Each row is one prompt. Desktop bars show all five response points; mobile bars combine strong and ordinary agreement or disagreement. n is the response count, so denominators differ.",
    patternsTakeaway: "Treat participation and evidence as policy-design requirements. Rewrite Q24 before using it to infer views on whether regulation can keep pace with AI.",
    pauseHeading: "Higher-neutral statements are priorities for follow-up",
    pauseIntro: "Neutral is not disagreement. It marks where wording, choices or context should be revisited; the reason was not measured.",
    pauseHow: "A longer line means a higher neutral share among that statement’s respondents. “Fewer responses” means fewer than 36 people answered.",
    pauseTakeaway: "This is not a disagreement ranking. It identifies statements that need clearer wording, response choices or background information.",
    themeKicker: "02 · From principles to action",
    themeHeading: "Three principles turn agreement into a practical governance test",
    themeIntro: "The principles become useful when they are applied consistently across five action areas. This is an analytical framework—not a single vote on a complete package.",
    themeHow: "The top row shows three strongly supported principles; the lower row organises five action areas. Each percentage refers only to the named example evidence, and response counts differ.",
    themeTakeaway: "Use these three principles as shared checks for education, age safeguards, product assessment, redress and rights protection.",
    tensionKicker: "03 · Both-and priorities",
    tensionHeading: "Many people supported both sides of an apparent trade-off",
    tensionIntro: "The overlap shows where the same respondents supported two measures that are often presented as competing choices.",
    tensionHow: "Each Venn diagram includes only people who answered both statements. Circle A shows support for the first option, circle B the second, and the overlap shows support for both.",
    tensionTakeaway: "Among joint respondents, 67% backed both age boundaries and contextual judgment; 45% backed both prevention and redress. The rights pairing is preliminary because only 26 people answered both statements.",
    commonLabel: "Common ground:",
    commonText: "Use age bands as a baseline; tailor measures to content, context and risk; and build in evidence review, privacy safeguards and routes for appeal.",
    coverageKicker: "04 · Where evidence is thinner",
    coverageHeading: "Later answers are thinner evidence—and Q24 needs rewriting",
    coverageIntro: "Response counts fell from 69 to 23. Before drawing substantive conclusions from later prompts, the response coverage and the wording of Q24 need attention.",
    coverageHow: "The horizontal axis is statement order and the vertical axis is response count; the background separates the first, middle and final eight statements.",
    coverageTakeaway: "Use the later prompts as an agenda for the next round, not as evidence of weaker support. Re-ask them with clearer wording and fuller participation.",
    coverageCalloutLabel: "Next round:",
    coverageCallout: "Prioritise follow-up on later statements before comparing them with higher-coverage results.",
    groupsKicker: "05 · Opinion landscape",
    groupsHeadingPublishable: "Three overlapping tendencies—not opposing camps",
    groupsHeadingWithheld: "Three overlapping tendencies—not opposing camps",
    groupsHeadingUnavailable: "More overlapping responses are needed",
    groupsIntroPublishable: "The clearest differences concern how to distribute attention: before and after harm, and across product rules, education, context and civil liberties. A participant can align with more than one tendency.",
    groupsIntroWithheld: "The clearest differences concern how to distribute attention: before and after harm, and across product rules, education, context and civil liberties. A participant can align with more than one tendency.",
    groupsIntroUnavailable: "There is not enough shared voting data to calculate a meaningful participant grouping.",
    groupsHow: "The two axes summarise the main response gradients. Shaded areas are overlapping soft profiles; they are a reading aid and do not assign anyone to a fixed group.",
    groupsTakeaway: "All three tendencies share formal youth participation and research into concrete harms. Their differences concern policy emphasis, while several priorities remain compatible.",
    implicationsKicker: "06 · What follows",
    implicationsHeading: "The data points to a sequence of next moves",
    implicationsIntro: "These are practical implications from this session—not a claim to represent everyone in Taiwan.",
    groupMethodSummary: "How this report was analysed—step by step",
    appendixKicker: "07 · Evidence",
    appendixHeading: "Explore the detail when needed",
    appendixIntro: "Open the sections below for the step-by-step methodology, complete prompt results and chart downloads.",
    tableSummary: "View all 24 prompts",
    downloadSummary: "Download charts",
    headers: ["No.", "Short label", "n", "Coverage", "Agree", "Neutral", "Disagree"],
    downloads: ["Key response patterns", "Neutral follow-up", "Principles and action areas", "Paired priorities", "Response coverage", "Opinion-tendency map"],
    vector: "SVG vector graphic",
    extracted: "Data extracted",
    created: "Session created",
    generated: "Report generated",
    footer: "HearTheRoom aggregate analysis · No names, identifiers or individual voting records.",
  } : {
    htmlLang: "zh-Hant-TW",
    pageTitle: "兒少 AI 安全治理｜審議分析",
    nav: '<nav class="language-nav" aria-label="語言"><a href="en/index.html" hreflang="en" lang="en">English</a></nav>',
    eyebrow: "審議分析・會次 ",
    topicLabel: "議題",
    heroTitle: "共識指向可調整、多管齊下的治理組合",
    lead: "在各題作答者中，最明確的方向是讓兒少正式參與、釐清具體傷害，並把安全措施與被害人協助納入同一套政策設計。多組看似拉扯的主張也同時獲得支持。",
    participants: "位參與者",
    statements: "題",
    responses: "筆回應",
    aggregate: "僅呈現彙整資料",
    patternsKicker: "01・共同基礎",
    howLabel: "圖怎麼看：",
    takeawayLabel: "這代表什麼：",
    patternsHeading: "最清楚的共識，落在政策如何設計與調整",
    patternsIntro: "參與者最一致支持讓兒少正式參與，並先釐清具體傷害。這些結果為後續治理提供共同原則，尚未指定單一管制工具。",
    patternsHow: "每列是一題；桌面版色帶顯示五點回應，手機版則合併高度與一般的同意／不同意。右側是作答人數，各列分母不同。",
    patternsTakeaway: "應把兒少參與與傷害實證視為政策設計的基本條件；第 24 題需改寫後重問，不能用現有回應推論對法規速度的立場。",
    pauseHeading: "下一輪可優先重新確認中立比例較高的題目",
    pauseIntro: "中立回應提醒我們重新檢查題意、選項或背景資訊；本次資料仍無法判斷選擇中立的原因。",
    pauseHow: "線越長，表示該題作答者中選擇中立的比例越高；「作答較少」表示少於 36 人回答。",
    pauseTakeaway: "這張圖用來找出需要補強問法、選項或背景說明的題目。",
    themeKicker: "02・從原則到行動",
    themeHeading: "把三項共識原則，變成五個可執行的共同檢核",
    themeIntro: "這套分析框架把三項原則連結到五個行動面向；各項比例來自不同題目，需逐項理解。",
    themeHow: "上排是三項高支持原則，下排是五個行動面向。連線表示分析整理上的關係；每個百分比只對應卡片所列的示例題目，而且各項作答人數不同。",
    themeTakeaway: "實務上可把這三項原則當作共同檢核，用來檢視教育、分齡、產品評估、救濟與權利保障。",
    tensionKicker: "03・兩者都要",
    tensionHeading: "許多人同時支持看似拉扯的兩種做法",
    tensionIntro: "重疊區呈現同一位參與者同時支持兩項政策措施的情況。",
    tensionHow: "每張文氏圖只納入兩題都有作答者。圓 A 代表支持第一項，圓 B 代表支持第二項，重疊區代表兩項都支持。",
    tensionTakeaway: "共同作答者中，67% 同時支持年齡界線與情境判斷；45% 同時支持事前預防與事後救濟。權利組合只有 26 人共同作答，先視為初步訊號。",
    commonLabel: "共同方向：",
    commonText: "以分齡作基線，再依內容、情境與風險調整；同時納入實證檢討、隱私保障與申訴管道。",
    coverageKicker: "04・證據較薄的地方",
    coverageHeading: "愈到後段，資料愈薄；第 24 題也需要重寫",
    coverageIntro: "作答人數從 69 人降至 23 人。在解讀後段主張前，應先處理作答完整度與第 24 題的題型問題。",
    coverageHow: "橫軸是題目順序，縱軸是各題作答人數；底色分出前、中、後八題。",
    coverageTakeaway: "把後段主張列入下一輪補問清單，用更清楚的問法和更完整的參與再次確認，避免把較少回應誤讀為較弱支持。",
    coverageCalloutLabel: "下一輪：",
    coverageCallout: "優先補問後段題目，再與高覆蓋結果比較。",
    groupsKicker: "05・意見分布",
    groupsHeadingPublishable: "三種可重疊的傾向，呈現治理重點的差異",
    groupsHeadingWithheld: "三種可重疊的傾向，呈現治理重點的差異",
    groupsHeadingUnavailable: "需要更多共同作答資料",
    groupsIntroPublishable: "最明顯的差異，在於治理資源如何分配：傷害發生前與發生後各放多少，以及產品規範、教育、情境與自由如何取得平衡。同一位參與者可能同時接近多種傾向。",
    groupsIntroWithheld: "最明顯的差異，在於治理資源如何分配：傷害發生前與發生後各放多少，以及產品規範、教育、情境與自由如何取得平衡。同一位參與者可能同時接近多種傾向。",
    groupsIntroUnavailable: "目前沒有足夠的共同作答資料，無法形成有意義的參與者分群。",
    groupsHow: "兩條軸整理作答模式中的主要差異；半透明區域是可重疊的柔性取向，用來協助閱讀，不替任何人指定固定群組。",
    groupsTakeaway: "三種傾向都把兒少正式參與與具體傷害研究放在核心；不同之處主要是政策著力點，多項做法仍可同時採用。",
    implicationsKicker: "06・接下來怎麼做",
    implicationsHeading: "這份資料指出下一步應怎麼走",
    implicationsIntro: "以下實務含意適用於本場資料；後續仍需透過更廣泛的參與確認。",
    groupMethodSummary: "這份報告如何一步一步分析",
    appendixKicker: "07・資料與方法",
    appendixHeading: "需要時，再看細節",
    appendixIntro: "下方以收合區塊整理七個分析步驟、24 題完整結果與圖表下載。",
    tableSummary: "查看 24 題完整結果",
    downloadSummary: "下載圖表",
    headers: ["題序", "短標籤", "作答人數", "覆蓋率", "同意", "中立", "不同意"],
    downloads: ["關鍵作答分布", "中立題目補問", "原則與行動面向", "政策主張重疊", "作答完整度", "意見傾向地圖"],
    vector: "SVG 向量圖",
    extracted: "資料擷取",
    created: "會次建立",
    generated: "報告產製",
    footer: "HearTheRoom 彙整分析・不含姓名、識別碼或個別投票紀錄。",
  };
  const tableRows = english ? buildEnglishAggregateTable(metrics) : buildAggregateTable(metrics);
  const headlineInsights = english ? buildEnglishPlotInsights(metrics) : buildPlotInsights(metrics);
  const mobileVotePatterns = buildMobileVotePatterns(metrics, english);
  const mobilePause = buildMobilePauseSummary(metrics, voterCount, english);
  const mobileTheme = buildMobileThemeSummary(metrics, english);
  const mobileTensions = buildMobileTensionSummary({ tensionOverlaps }, english);
  const mobileCoverage = buildMobileCoverageSummary(english);
  const mobileGroups = buildMobileOpinionLandscapeSummary(groupAnalysis, english);
  const implicationsHtml = buildImplicationsHtml({ metrics, tensionOverlaps }, english);
  const analysisMethod = buildAnalysisMethodHtml({ groupAnalysis, voterCount, totals }, english);
  const groupHeading = groupAnalysis.status === "publishable"
    ? copy.groupsHeadingPublishable
    : groupAnalysis.status === "unavailable"
      ? copy.groupsHeadingUnavailable
      : copy.groupsHeadingWithheld;
  const groupIntro = groupAnalysis.status === "publishable"
    ? copy.groupsIntroPublishable
    : groupAnalysis.status === "unavailable"
      ? copy.groupsIntroUnavailable
      : copy.groupsIntroWithheld;
  const totalText = totals.responses.toLocaleString(english ? "en-GB" : "zh-TW");
  const chartBases = ["01-key-statements", "02-pause-map", "03-theme-map", "04-overlap-mosaics", "05-response-coverage", "06-opinion-landscape"];
  assert(chartBases.length === copy.downloads.length, "Every chart download needs a translated label.");

  return '<!doctype html>\n<html lang="' + copy.htmlLang + '">\n<head>\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\' data:; style-src \'unsafe-inline\'; font-src data:; base-uri \'none\'; form-action \'none\'">\n' +
    '<title>' + escapeHtml(copy.pageTitle) + '</title>\n<style>\n' + EMBEDDED_FONT_CSS + '\n' +
    ':root{--bg:#fff;--paper:#fff;--ink:#161616;--muted:#60656a;--line:#d7d9d9;--teal:#0e747e;--teal-soft:#eaf2f2;--max:1120px;color-scheme:light}\n' +
    '*{box-sizing:border-box}html{font-family:' + FONT_STACK + ';color:var(--ink);background:var(--bg);font-synthesis:none}body{margin:0;line-height:1.65;overflow-wrap:anywhere}a{color:var(--teal);text-underline-offset:.2em}header,main,footer{width:min(calc(100% - 40px),var(--max));margin-inline:auto}header{padding:54px 0 38px;border-bottom:1px solid var(--line)}.language-nav{display:flex;justify-content:flex-end;margin-bottom:14px}.language-nav a{font-size:.88rem;font-weight:500;text-decoration:none}.eyebrow{margin:0 0 12px;color:var(--teal);font-size:.85rem;font-weight:500;letter-spacing:.07em}.topic{margin:0 0 10px;color:var(--muted);font-size:.95rem}h1{max-width:900px;margin:0;font-size:clamp(2.2rem,4.8vw,4.35rem);font-weight:500;line-height:1.08;letter-spacing:-.035em}h2{margin:0;font-size:clamp(1.75rem,3vw,2.55rem);font-weight:500;line-height:1.2;letter-spacing:-.02em}h3{margin:0;font-size:1.08rem;font-weight:500;line-height:1.4}.lead{max-width:820px;margin:22px 0 0;font-size:clamp(1.08rem,1.8vw,1.3rem);line-height:1.6}.snapshot{display:flex;flex-wrap:wrap;gap:6px 24px;margin-top:22px;color:var(--muted);font-size:.9rem}.snapshot strong{color:var(--ink);font-weight:500}.headline-insights{display:grid;grid-template-columns:repeat(3,1fr);margin-top:34px;border-block:1px solid var(--line)}.headline-insights article{min-width:0;padding:24px}.headline-insights article:first-child{padding-left:0}.headline-insights article:last-child{padding-right:0}.headline-insights article+article{border-left:1px solid var(--line)}.insight-label{display:block;color:var(--muted);font-size:.82rem;font-weight:500;letter-spacing:.06em;text-transform:uppercase}.headline-insights strong{display:block;margin-top:6px;font-family:' + ACCENT_FONT_STACK + ';font-size:2.15rem;font-weight:400;line-height:1.15}.headline-insights p{margin:7px 0 0;color:var(--muted);font-size:.92rem;line-height:1.5}main{padding:72px 0 100px}.section{margin-top:92px}.section:first-child{margin-top:0}.section-head{max-width:800px;margin-bottom:28px}.section-kicker{margin:0 0 7px;color:var(--teal);font-size:.82rem;font-weight:500;letter-spacing:.07em;text-transform:uppercase}.section-head>p:last-child{margin:12px 0 0;color:var(--muted);font-size:1rem}.figure{margin:28px 0 0}.figure svg{display:block;width:100%;height:auto;border-radius:18px}.figure figcaption{margin:18px 0 0;color:var(--muted);font-size:.88rem}.figure-notes{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line)}.figure-notes span{padding:16px 20px 0 0}.figure-notes span+span{padding-left:20px;border-left:1px solid var(--line)}.figure-notes b{display:block;margin-bottom:3px;color:var(--ink);font-weight:500}.mobile-chart{display:none}.mobile-chart-head{font-size:1.12rem}.mobile-vote-legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:13px;color:var(--muted);font-size:.78rem}.mobile-vote-legend span{display:flex;align-items:center;gap:6px}.mobile-vote-legend i{width:11px;height:11px;border-radius:2px}.mobile-vote-legend .support,.mobile-vote-bar .support{background:#147D8D}.mobile-vote-legend .neutral,.mobile-vote-bar .neutral{background:#C9D2D8}.mobile-vote-legend .oppose,.mobile-vote-bar .oppose{background:#D66D52}.mobile-vote-list{margin-top:8px}.mobile-vote-list article{padding:12px 0;border-bottom:1px solid var(--line)}.mobile-vote-label{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.mobile-vote-label strong{font-size:.9rem;font-weight:500}.mobile-vote-label span{flex:0 0 auto;color:var(--muted);font-size:.78rem}.mobile-vote-bar{display:flex;height:24px;margin-top:7px;overflow:hidden;border-radius:5px;background:var(--line)}.mobile-vote-bar>span{display:flex;min-width:0;align-items:center;justify-content:center}.mobile-vote-bar b{color:#fff;font-size:.78rem;font-weight:500}.mobile-vote-bar .neutral b{color:var(--ink)}.mobile-vote-note{margin:12px 0 0;color:var(--muted);font-size:.78rem}.mobile-principle{margin-top:14px;padding:15px 0;border-block:1px solid var(--line)}.mobile-principle strong,.mobile-principle span{display:block}.mobile-principle span,.mobile-coverage-unit{margin-top:3px;color:var(--muted);font-size:.82rem}.mobile-chart-list{list-style:none;margin:6px 0 0;padding:0}.mobile-chart-list li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1px 12px;padding:13px 0 13px 12px;border-bottom:1px solid var(--line);border-left:4px solid var(--teal)}.mobile-chart-list li:nth-child(2){border-left-color:#6656A3}.mobile-chart-list li:nth-child(3){border-left-color:#AF782B}.mobile-chart-list li:nth-child(4){border-left-color:#C85D42}.mobile-chart-list li:nth-child(5){border-left-color:#7C5361}.mobile-chart-list li>strong,.mobile-chart-list li>span{font-weight:500}.mobile-chart-list p{grid-column:1/-1;margin:2px 0 0;color:var(--muted);font-size:.88rem}.mobile-tensions article{padding:16px 0;border-bottom:1px solid var(--line)}.mobile-tension-title{display:block;font-weight:500}.mobile-tension-sides{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.mobile-tension-sides span{padding:7px 9px;background:var(--paper);font-size:.8rem}.mobile-both{margin:8px 0 0;color:var(--teal);font-weight:500}.mobile-tensions article>p:last-child{margin:3px 0 0;color:var(--muted);font-size:.86rem}.mobile-coverage-unit{display:block}.mobile-coverage-row{display:grid;grid-template-columns:62px minmax(0,1fr) 42px;align-items:center;gap:10px;margin-top:13px;font-size:.84rem}.mobile-coverage-row i{height:12px;background:var(--line);border-radius:999px;overflow:hidden}.mobile-coverage-row i b{display:block;height:100%;background:var(--teal);border-radius:inherit}.mobile-coverage-row strong{text-align:right;font-weight:500;font-variant-numeric:tabular-nums}.takeaway,.coverage-callout{margin:26px 0 0;padding:22px 26px;border-left:5px solid var(--teal);background:var(--teal-soft)}.takeaway strong,.coverage-callout strong{font-weight:500}.appendix{padding-top:72px;border-top:1px solid var(--line)}details{margin-top:12px;background:var(--paper);border:1px solid var(--line);border-radius:14px}summary{cursor:pointer;padding:17px 20px;font-weight:500}.detail-body{padding:4px 20px 24px}.detail-body>.figure{margin-top:0}.method{display:grid;grid-template-columns:1fr 1fr;gap:28px}.method h3{margin-bottom:8px}.method p{margin:0;color:var(--muted)}.group-method-note{grid-column:1/-1;padding-top:16px;border-top:1px solid var(--line);font-size:.86rem}.methodology-details{background:transparent;border:0;border-block:1px solid var(--ink);border-radius:0}.methodology-details summary{padding-inline:0}.methodology-details .detail-body{padding-inline:0}.methodology-intro{max-width:780px;margin:6px 0 20px;color:var(--muted)}.method-steps{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}.method-step{display:grid;grid-template-columns:48px minmax(0,1fr);gap:24px;padding:24px 0;border-bottom:1px solid var(--line)}.method-step-number{padding-top:2px;color:var(--teal);font-size:.82rem;font-weight:500;letter-spacing:.06em}.method-step h3{font-size:1.12rem}.method-step p{max-width:880px;margin:8px 0 0;color:var(--muted)}.method-step-meaning{padding-left:14px;border-left:2px solid var(--line);font-size:.9rem}.method-step-meaning b{display:block;margin-bottom:2px;color:var(--ink);font-weight:500}.table-wrap{overflow-x:auto}.table-wrap table{width:100%;border-collapse:collapse;font-size:.86rem}th,td{padding:11px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-weight:500;white-space:nowrap}.number{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.support{color:#0d6875;font-weight:500}.downloads{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.download{display:block;padding:14px;background:var(--bg);border-radius:10px;text-decoration:none}.download strong,.download span{display:block}.download strong{color:var(--ink);font-weight:500}.download span{margin-top:2px;color:var(--muted);font-size:.8rem}footer{padding:26px 0 42px;border-top:1px solid var(--line);color:var(--muted);font-size:.84rem}.footer-meta{display:flex;flex-wrap:wrap;gap:6px 20px;margin-bottom:5px}\n' +
    '.insight-meter{display:block;height:8px;margin-top:10px;overflow:hidden;border-radius:999px;background:var(--line)}.insight-meter i{display:block;height:100%;border-radius:inherit;background:var(--teal)}.insight-meter.secondary{height:6px;margin-top:6px}.insight-extra{display:flex;align-items:baseline;gap:7px;margin-top:13px;color:var(--muted);font-size:.82rem}.insight-extra b{flex:0 0 auto;white-space:nowrap;color:var(--teal);font-size:1.05rem;font-weight:500}.insight-split{display:flex;height:8px;margin-top:10px;overflow:hidden;border-radius:999px;background:var(--line)}.insight-split i{display:block;height:100%}.insight-split .support{background:#147d8d}.insight-split .neutral{background:#aebbc2}.insight-split .oppose{background:#d66d52}.mobile-principle-heading{display:block;margin-bottom:9px}.mobile-principle-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:8px 0}.mobile-principle-row>span b,.mobile-principle-row>span small{display:block}.mobile-principle-row>span b{color:var(--ink);font-size:.86rem;font-weight:500}.mobile-principle-row>span small{color:var(--muted);font-size:.74rem}.mobile-principle-row>strong{align-self:center;color:var(--teal);font-size:1rem;font-weight:500}.mobile-principle-row>i{grid-column:1/-1;display:block;height:7px;overflow:hidden;border-radius:999px;background:var(--line)}.mobile-principle-row>i b{display:block;height:100%;border-radius:inherit;background:var(--teal)}.mobile-principle-meaning{grid-column:1/-1;margin:4px 0 0;color:var(--muted);font-size:.8rem}.mobile-chart-list li{--row-color:#147d8d;border-left-color:var(--row-color)}.mobile-chart-list li:nth-child(2){--row-color:#6656a3;border-left-color:var(--row-color)}.mobile-chart-list li:nth-child(3){--row-color:#af782b;border-left-color:var(--row-color)}.mobile-chart-list li:nth-child(4){--row-color:#c85d42;border-left-color:var(--row-color)}.mobile-chart-list li:nth-child(5){--row-color:#7c5361;border-left-color:var(--row-color)}.mobile-theme-meter{grid-column:1/-1;display:block;height:7px;margin-top:7px;overflow:hidden;border-radius:999px;background:var(--line)}.mobile-theme-meter b{display:block;height:100%;border-radius:inherit;background:var(--row-color)}.mobile-group-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--line)}.mobile-group-head>span{flex:0 0 auto;padding:3px 9px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:.72rem;font-weight:500}.mobile-group-row{padding:14px 0;border-bottom:1px solid var(--line)}.mobile-group-row>div{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.mobile-group-row span{font-size:.84rem}.mobile-group-row strong{flex:0 0 auto;font-weight:500}.mobile-group-meta{display:block;margin-top:2px;color:var(--muted);font-size:.75rem}.mobile-group-row>i{display:block;height:9px;margin-top:7px;overflow:hidden;border-radius:999px;background:var(--line)}.mobile-group-row>i b{display:block;height:100%;border-radius:inherit;background:#aebbc2}.mobile-group-row>i .group-meter-0{background:var(--teal)}.mobile-group-row>i .group-meter-1{background:#7568a8}.mobile-group-row>i .group-meter-2{background:#b6772b}.mobile-groups>small{display:block;margin-top:10px;color:var(--muted)}.mobile-groups>p{margin:14px 0 0;padding:12px 14px;background:var(--paper);font-size:.86rem}\n' +
    '.pause-block{margin-top:64px;padding-top:52px;border-top:1px solid var(--line)}.subsection-head{max-width:800px}.subsection-head h3{font-size:clamp(1.4rem,2.3vw,2rem);line-height:1.25}.subsection-head p{margin:10px 0 0;color:var(--muted)}.mobile-overlap-legend{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-top:12px;color:var(--muted);font-size:.75rem}.mobile-overlap-legend span,.mobile-rerun-legend span{display:flex;align-items:center;gap:6px}.mobile-overlap-legend i,.mobile-rerun-legend i{display:block;width:12px;height:12px;flex:0 0 auto;border-radius:3px}.overlap-both{background:#147d8d}.overlap-leftOnly{background:#b6772b}.overlap-rightOnly{background:#7568a8}.overlap-neither{background:#aebbc2}.mobile-overlap-bar{display:flex;height:22px;margin-top:10px;overflow:hidden;border-radius:5px;background:var(--line)}.mobile-overlap-bar i{display:block;height:100%}.mobile-overlap-stats{display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;margin-top:8px;color:var(--muted);font-size:.75rem}.mobile-overlap-stats b{color:var(--ink);font-weight:500}.mobile-tensions article>small{display:block;margin-top:7px;color:var(--muted)}.mobile-overlap-note{margin:12px 0 0;color:var(--muted);font-size:.78rem}.mobile-pause article{padding:14px 0;border-bottom:1px solid var(--line)}.mobile-pause-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.mobile-pause-head span{font-size:.86rem}.mobile-pause-head strong{flex:0 0 auto;font-weight:500}.mobile-pause-meter{display:block;height:9px;margin-top:8px;overflow:hidden;border-radius:999px;background:var(--line)}.mobile-pause-meter b{display:block;height:100%;border-radius:inherit;background:#7568a8}.mobile-pause-meta{display:flex;align-items:center;gap:8px;margin-top:6px;color:var(--muted);font-size:.75rem}.mobile-pause-meta em{padding:1px 7px;border:1px solid #b6772b;border-radius:999px;color:#8b5b20;font-style:normal}.mobile-pause>p{margin:12px 0 0;color:var(--muted);font-size:.78rem}.mobile-groups>.mobile-rerun-intro{margin:12px 0 0;padding:0;background:none;color:var(--muted);font-size:.8rem}.mobile-rerun-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:4px;margin-top:12px}.mobile-rerun-grid i{display:block;aspect-ratio:1;border-radius:4px}.rerun-k2{background:#147d8d}.rerun-k3{background:#7568a8}.rerun-k4{background:#b6772b}.rerun-k5{background:#7c5361}.mobile-rerun-grid .rerun-passed{outline:2px solid var(--ink);outline-offset:-2px}.mobile-rerun-legend{display:grid;grid-template-columns:1fr 1fr;gap:5px 12px;margin-top:10px;color:var(--muted);font-size:.75rem}.mobile-rerun-same{display:block;margin-top:9px;color:var(--muted);font-size:.75rem}.mobile-landscape-intro{margin:8px 0 0;color:var(--muted);font-size:.84rem}.mobile-density-wrap{margin-top:16px}.mobile-density-y,.mobile-density-x{display:block;color:var(--muted);font-size:.72rem}.mobile-density-y{margin-bottom:5px}.mobile-density-x{margin-top:5px;text-align:center}.mobile-density-map{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:4px;aspect-ratio:1.267;padding:4px;border:1px solid var(--line);border-radius:12px;background:var(--line);overflow:hidden}.mobile-density-cell{display:grid;place-content:center;text-align:center;border-radius:8px}.mobile-density-cell.shown{border:1px solid var(--teal);background:rgb(20 125 141 / var(--cell-alpha));color:var(--ink)}.mobile-density-cell.suppressed{border:1px solid var(--line);background:var(--paper)}.mobile-density-cell strong,.mobile-density-cell small{display:block}.mobile-density-cell strong{font-size:1rem;font-weight:500}.mobile-density-cell small{font-size:.66rem}.mobile-landscape-meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 14px;margin-top:12px;color:var(--muted);font-size:.78rem}.mobile-landscape-privacy{margin:8px 0 0;color:var(--muted);font-size:.78rem}.mobile-landscape-stability{margin-top:16px}.mobile-landscape-stability>span{display:block;font-size:.82rem}.mobile-landscape-stability i{position:relative;display:block;height:10px;margin-top:7px;border-radius:999px;background:var(--line)}.mobile-landscape-stability i b{display:block;height:100%;border-radius:inherit;background:#b6772b}.mobile-landscape-stability i em{position:absolute;top:-5px;bottom:-5px;width:2px;background:var(--ink)}.mobile-landscape-takeaway{margin:16px 0 0;padding:12px 14px;background:var(--paper);font-size:.86rem}\n' +
    '.mobile-venn{display:block;width:100%;height:auto;margin-top:6px;overflow:visible}.mobile-venn .venn-circle-a{fill:#147d8d;fill-opacity:.28;stroke:#147d8d;stroke-width:2}.mobile-venn .venn-circle-b{fill:#7568a8;fill-opacity:.26;stroke:#7568a8;stroke-width:2}.mobile-venn text{font-family:inherit;fill:var(--ink)}.venn-side-label{font-size:11px;fill:var(--muted)!important}.venn-side-value{font-size:12px;font-weight:500}.venn-both-label{font-size:11px;font-weight:500;letter-spacing:.04em}.venn-both-value{font-size:20px;font-weight:500}.mobile-venn-side-stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:-14px;color:var(--muted);font-size:.76rem}.mobile-venn-side-stats span:last-child{text-align:right}.mobile-venn-side-stats b{color:var(--ink);font-weight:500}.mobile-venn-outside{margin:8px 0 0;text-align:center;color:var(--muted);font-size:.76rem}.mobile-tensions article{padding:16px 0;border-bottom:1px solid var(--line)}.mobile-tensions article>small{margin-top:4px;text-align:center}.mobile-stability-result{display:flex;align-items:flex-end;gap:14px;padding:4px 0 18px;border-bottom:1px solid var(--ink)}.mobile-stability-result strong{flex:0 0 auto;font-family:' + ACCENT_FONT_STACK + ';font-size:3rem;font-weight:400;line-height:1}.mobile-stability-result span{padding-bottom:4px;color:var(--muted);font-size:.8rem}.mobile-stability-conclusion{padding:18px 0;border-bottom:1px solid var(--line)}.mobile-stability-conclusion>span{display:block;color:var(--muted);font-size:.72rem;letter-spacing:.08em;text-transform:uppercase}.mobile-stability-conclusion>strong{display:block;margin-top:7px;font-family:' + ACCENT_FONT_STACK + ';font-size:1.35rem;font-weight:400;line-height:1.25}.mobile-stability-conclusion>p{margin:8px 0 0}.mobile-stability-scale{padding-top:18px}.mobile-stability-scale>span{display:block;font-size:.82rem}.mobile-stability-scale i{position:relative;display:block;height:9px;margin-top:9px;background:var(--line)}.mobile-stability-scale i b{display:block;height:100%;background:#b6772b}.mobile-stability-scale i em{position:absolute;top:-5px;bottom:-5px;width:2px;background:var(--ink)}.mobile-stability-method{margin:16px 0 0;color:var(--muted);font-size:.78rem}.mobile-tendency-map{display:block;width:100%;height:auto;overflow:visible}.mobile-tendency-map text{font-family:inherit;fill:var(--ink)}.mobile-tendency-axis{stroke:var(--muted);stroke-width:1}.mobile-tendency-name{font-size:11px;font-weight:500}.mobile-tendency-end{font-size:9px;fill:var(--muted)!important}.mobile-tendency-profile{display:grid;grid-template-columns:4px minmax(0,1fr);gap:12px;padding:14px 0;border-top:1px solid var(--line)}.mobile-tendency-profile>i{display:block;width:4px;height:100%}.mobile-tendency-profile strong{display:block;font-size:.94rem;font-weight:500}.mobile-tendency-profile p{margin:4px 0 0;color:var(--muted);font-size:.8rem}.mobile-tendency-shared{margin:16px 0 0;padding:14px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);font-size:.84rem}.mobile-tendency-shared b{display:block;margin-bottom:4px;font-size:.72rem;font-weight:500;letter-spacing:.06em;text-transform:uppercase}.downloads{gap:0 24px}footer{border-top:1px solid var(--ink)}\n' +
    '@media(max-width:760px){header{padding-top:38px}h1{font-size:2.15rem;line-height:1.06}.headline-insights{grid-template-columns:1fr}.headline-insights article{padding:20px 0}.headline-insights article+article{border-left:0;border-top:1px solid var(--line)}main{padding-top:58px}.section{margin-top:72px}.figure{margin-inline:-10px}.figure svg{border-radius:10px}.responsive-figure{margin-inline:0}.responsive-figure .desktop-chart{display:none}.responsive-figure .mobile-chart{display:block}.responsive-figure .mobile-hide{display:none}.figure-notes{grid-template-columns:1fr}.figure-notes span{padding-right:0}.figure-notes span+span{padding-left:0;border-left:0}.pause-block{margin-top:50px;padding-top:42px}.implication-list li{grid-template-columns:32px minmax(0,1fr);gap:12px;padding:18px 0}.implication-list h3{font-size:1.28rem}.method,.downloads{grid-template-columns:1fr}.method-step{grid-template-columns:34px minmax(0,1fr);gap:12px;padding:20px 0}.method-step h3{font-size:1.02rem}.method-step p{font-size:.88rem}.method-step-meaning{padding-left:10px}.appendix{padding-top:56px}}\n' +
    '@media print{@page{size:A4;margin:14mm}html,body{background:#fff}header,main,footer{width:100%}header{padding-top:0}.section{break-before:page;margin-top:0}.section:first-child{break-before:auto}.figure svg{break-inside:avoid}.pause-block{break-before:page}.appendix{display:none}}\n' +
    '</style>\n</head>\n<body>\n<header>' + copy.nav +
    '<p class="eyebrow">' + escapeHtml(copy.eyebrow + sessionId) + '</p>' +
    '<p class="topic">' + escapeHtml(copy.topicLabel) + '｜' + escapeHtml(topic) + '</p>' +
    '<h1>' + escapeHtml(copy.heroTitle) + '</h1><p class="lead">' + escapeHtml(copy.lead) + '</p>' +
    '<div class="snapshot"><span><strong>' + voterCount + '</strong> ' + escapeHtml(copy.participants) + '</span><span><strong>24</strong> ' + escapeHtml(copy.statements) + '</span><span><strong>' + totalText + '</strong> ' + escapeHtml(copy.responses) + '</span><span>' + escapeHtml(copy.aggregate) + '</span></div>' +
    headlineInsights + '</header>\n<main>\n' +
    '<section class="section" id="vote-patterns"><div class="section-head"><p class="section-kicker">' + escapeHtml(copy.patternsKicker) + '</p><h2>' + escapeHtml(copy.patternsHeading) + '</h2><p>' + escapeHtml(copy.patternsIntro) + '</p></div><figure class="figure responsive-figure"><div class="desktop-chart">' + svgs.keyStatements + '</div>' + mobileVotePatterns + buildFigureNotes({ howLabel: copy.howLabel, how: copy.patternsHow, takeawayLabel: copy.takeawayLabel, takeaway: copy.patternsTakeaway }) + '</figure></section>\n' +
    '<section class="section" id="shared-direction"><div class="section-head"><p class="section-kicker">' + escapeHtml(copy.themeKicker) + '</p><h2>' + escapeHtml(copy.themeHeading) + '</h2><p>' + escapeHtml(copy.themeIntro) + '</p></div><figure class="figure responsive-figure"><div class="desktop-chart">' + svgs.themeMap + '</div>' + mobileTheme + buildFigureNotes({ howLabel: copy.howLabel, how: copy.themeHow, takeawayLabel: copy.takeawayLabel, takeaway: copy.themeTakeaway }) + '</figure></section>\n' +
    '<section class="section" id="overlapping-priorities"><div class="section-head"><p class="section-kicker">' + escapeHtml(copy.tensionKicker) + '</p><h2>' + escapeHtml(copy.tensionHeading) + '</h2><p>' + escapeHtml(copy.tensionIntro) + '</p></div><figure class="figure responsive-figure"><div class="desktop-chart">' + svgs.overlapMosaics + '</div>' + mobileTensions + buildFigureNotes({ howLabel: copy.howLabel, how: copy.tensionHow, takeawayLabel: copy.takeawayLabel, takeaway: copy.tensionTakeaway }) + '</figure></section>\n' +
    '<section class="section" id="confidence"><div class="section-head"><p class="section-kicker">' + escapeHtml(copy.coverageKicker) + '</p><h2>' + escapeHtml(copy.coverageHeading) + '</h2><p>' + escapeHtml(copy.coverageIntro) + '</p></div><figure class="figure responsive-figure"><div class="desktop-chart">' + svgs.coverage + '</div>' + mobileCoverage + buildFigureNotes({ howLabel: copy.howLabel, how: copy.coverageHow, takeawayLabel: copy.takeawayLabel, takeaway: copy.coverageTakeaway }) + '</figure>' +
    '<div class="pause-block" id="pause-points"><div class="subsection-head"><h3>' + escapeHtml(copy.pauseHeading) + '</h3><p>' + escapeHtml(copy.pauseIntro) + '</p></div><figure class="figure responsive-figure"><div class="desktop-chart">' + svgs.pauseMap + '</div>' + mobilePause + buildFigureNotes({ howLabel: copy.howLabel, how: copy.pauseHow, takeawayLabel: copy.takeawayLabel, takeaway: copy.pauseTakeaway }) + '</figure></div></section>\n' +
    '<section class="section group-section" id="opinion-landscape"><div class="section-head"><p class="section-kicker">' + escapeHtml(copy.groupsKicker) + '</p><h2>' + escapeHtml(groupHeading) + '</h2><p>' + escapeHtml(groupIntro) + '</p></div><figure class="figure responsive-figure"><div class="desktop-chart">' + svgs.opinionLandscape + '</div>' + mobileGroups + buildFigureNotes({ howLabel: copy.howLabel, how: copy.groupsHow, takeawayLabel: copy.takeawayLabel, takeaway: copy.groupsTakeaway }) + '</figure></section>\n' +
    '<section class="section implications" id="implications"><div class="section-head"><p class="section-kicker">' + escapeHtml(copy.implicationsKicker) + '</p><h2>' + escapeHtml(copy.implicationsHeading) + '</h2><p>' + escapeHtml(copy.implicationsIntro) + '</p></div>' + implicationsHtml + '</section>\n' +
    '<section class="section appendix" id="evidence"><div class="section-head"><p class="section-kicker">' + escapeHtml(copy.appendixKicker) + '</p><h2>' + escapeHtml(copy.appendixHeading) + '</h2><p>' + escapeHtml(copy.appendixIntro) + '</p></div>' +
    '<details class="methodology-details"><summary>' + escapeHtml(copy.groupMethodSummary) + '</summary>' + analysisMethod + '</details>' +
    '<details><summary>' + escapeHtml(copy.tableSummary) + '</summary><div class="detail-body table-wrap"><table><thead><tr>' + copy.headers.map((header, index) => '<th' + (index >= 2 ? ' class="number"' : '') + '>' + escapeHtml(header) + '</th>').join("") + '</tr></thead><tbody>' + tableRows + '</tbody></table></div></details>' +
    '<details><summary>' + escapeHtml(copy.downloadSummary) + '</summary><div class="detail-body downloads">' + chartBases.map((base, index) => '<a class="download" href="assets/' + base + '.svg"><strong>' + escapeHtml(copy.downloads[index]) + '</strong><span>' + escapeHtml(copy.vector) + '</span></a>').join("") + '</div></details></section>\n' +
    '</main><footer><div class="footer-meta"><span>' + escapeHtml(copy.extracted + " " + dataExtractedDate) + '</span><span>' + escapeHtml(copy.created + " " + sessionCreatedDate) + '</span><span>' + escapeHtml(copy.generated + " " + generatedDate) + '</span></div><span>' + escapeHtml(copy.footer) + '</span></footer>\n' +
    '</body>\n</html>\n';
}

function buildEnglishAggregateTable(metrics) {
  return metrics.map((metric) => (
    '<tr><td class="number">' + (metric.index + 1) + '</td>' +
    '<td>' + escapeHtml(EN_SHORT_LABELS[metric.index]) + '</td>' +
    '<td class="number">' + metric.n + '</td>' +
    '<td class="number">' + pct(metric.coveragePct) + '</td>' +
    '<td class="number support">' + metric.support + ' (' + pct(metric.supportPct) + ')</td>' +
    '<td class="number">' + metric.neutral + ' (' + pct(metric.neutralPct) + ')</td>' +
    '<td class="number">' + metric.oppose + ' (' + pct(metric.opposePct) + ')</td></tr>'
  )).join("\n");
}

function buildEnglishPlotInsights(metrics) {
  const strongest = Math.round(metrics[2].supportPct);
  const evidence = Math.round(metrics[7].supportPct);
  const review = Math.round(metrics[14].supportPct);
  const openNeutral = Math.round(metrics[23].neutralPct);
  return '<div class="headline-insights" aria-label="Three headline findings">' +
    '<article><span class="insight-label">Strongest agreement</span><strong>' + strongest + '%</strong>' +
    '<span class="insight-meter" role="img" aria-label="' + strongest + '% support"><i style="width:' + round(metrics[2].supportPct, 1) + '%"></i></span>' +
    '<p>Formal role for children and young people · ' + metrics[2].n + ' people answered</p></article>' +
    '<article><span class="insight-label">Evidence first</span><strong>' + evidence + '%</strong>' +
    '<span class="insight-meter" role="img" aria-label="' + evidence + '% support research into concrete harms"><i style="width:' + round(metrics[7].supportPct, 1) + '%"></i></span>' +
    '<p>Research into concrete harms · ' + metrics[7].n + ' people answered</p>' +
    '<div class="insight-extra"><b>' + review + '%</b><span>Regular policy review · ' + metrics[14].n + ' answered (fewer responses)</span></div>' +
    '<span class="insight-meter secondary" role="img" aria-label="' + review + '% support regular policy review"><i style="width:' + round(metrics[14].supportPct, 1) + '%"></i></span></article>' +
    '<article><span class="insight-label">Question needs revision</span><strong>' + openNeutral + '% chose neutral</strong>' +
    '<span class="insight-meter" role="img" aria-label="' + openNeutral + '% chose neutral on Q24"><i style="width:' + round(metrics[23].neutralPct, 1) + '%"></i></span>' +
    '<p>Q24 is phrased as a question; the remaining responses should not be read as policy support or opposition · ' + metrics[23].n + ' responses (fewer responses)</p></article>' +
    '</div>';
}

function buildEnglishDotKey(metrics) {
  const groups = [
    { title: "Higher coverage (75% or above)", filter: (metric) => metric.coveragePct >= 75 },
    { title: "Medium coverage (50–74%)", filter: (metric) => metric.coveragePct >= 50 && metric.coveragePct < 75 },
    { title: "Lower coverage (below 50%)", filter: (metric) => metric.coveragePct < 50 },
  ];
  const groupHtml = groups.map((group) => {
    const items = metrics.filter(group.filter).map((metric) => (
      '<li class="dot-key-item" id="statement-' + (metric.index + 1) + '">' +
      '<span class="dot-index">' + String(metric.index + 1).padStart(2, "0") + '</span>' +
      '<div><strong>' + escapeHtml(EN_SHORT_LABELS[metric.index]) + '</strong>' +
      '<small>Support ' + pct(metric.supportPct) + ' · Coverage ' + pct(metric.coveragePct) + ' · n = ' + metric.n + '</small></div></li>'
    )).join("");
    return '<section class="dot-key-group"><h4>' + group.title + '</h4><ul class="dot-key-list">' + items + '</ul></section>';
  }).join("");
  return '<div class="dot-key"><div class="dot-key-head"><h3>Dot key: all 24 statements</h3>' +
    '<p>Numbers follow statement order and are reference labels, not rankings. Start with each dot’s position, then check support, coverage and response count.</p></div>' +
    '<div class="dot-key-groups">' + groupHtml + '</div></div>';
}

function buildEnglishReportHtml(args) {
  const html = buildReportHtml(args, "en");
  assert(!/[\u3400-\u9FFF]/u.test(html), "Untranslated Chinese text remains in the English report.");
  return html;
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next known executable.
    }
  }
  return null;
}

async function findSips() {
  const candidates = ["/usr/bin/sips", "/bin/sips"];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // sips is available on macOS only.
    }
  }
  return null;
}

async function renderSvgPngWithSips({ sips, svgPath, pngPath }) {
  const result = spawnSync(sips, ["-s", "format", "png", svgPath, "--out", pngPath], {
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.status !== 0) {
    throw new Error("PNG render failed for " + path.basename(svgPath) + ": " + (result.stderr || result.stdout));
  }
  await fs.access(pngPath);
}

async function renderSvgPng({ chrome, svgPath, pngPath, width, height, userDataDir }) {
  const result = spawnSync(chrome, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + userDataDir,
    "--window-size=" + width + "," + height,
    "--screenshot=" + pngPath,
    pathToFileURL(svgPath).href,
  ], { encoding: "utf8", timeout: 4000, killSignal: "SIGKILL" });
  try {
    await fs.access(pngPath);
  } catch {
    throw new Error("PNG render failed for " + path.basename(svgPath) + ": " + (result.stderr || result.stdout));
  }
}

async function writeAggregateFile(filePath, content) {
  await fs.writeFile(filePath, content, { encoding: typeof content === "string" ? "utf8" : undefined, mode: 0o644 });
  await fs.chmod(filePath, 0o644);
}

async function main() {
  if (!process.argv[2]) {
    console.error("Usage: node data-analysis/generate-deliberation-report.mjs <raw-export.json> [reports-dir]");
    process.exit(1);
  }
  const inputPath = path.resolve(process.argv[2]);
  const reportsDirectory = path.resolve(process.argv[3] || DEFAULT_REPORTS_DIR);
  const rawBuffer = await fs.readFile(inputPath);
  const raw = JSON.parse(rawBuffer.toString("utf8"));
  const analysis = computeMetrics(raw);
  const polisAnalysis = analyzePolisInspiredSession(raw);
  const groupAnalysis = buildReportSafeGroupAnalysis(polisAnalysis);
  assert(/^[A-Za-z0-9_-]+$/.test(analysis.sessionId), "Unsafe session id for output path.");
  assert(polisAnalysis.sessionId === analysis.sessionId, "Aggregate and opinion-group session IDs differ.");
  if (groupAnalysis.pcaDensity && Array.isArray(groupAnalysis.pcaDensity.cells)) {
    assert(groupAnalysis.pcaDensity.cells.every((cell) => cell.count >= 5), "PCA density includes a cell below the privacy threshold.");
  }
  assert(!/(participantIndex|coordinates|groupId|groupLabel)/.test(JSON.stringify(groupAnalysis)), "Participant-level PCA data crossed the report privacy boundary.");

  const reportDirectory = path.join(reportsDirectory, analysis.sessionId);
  const englishReportDirectory = path.join(reportDirectory, "en");
  const editions = [
    {
      language: "zh",
      locale: "zh-Hant-TW",
      topic: String(raw.session.topic || "兒少 AI 安全治理"),
      reportDirectory,
      assetsDirectory: path.join(reportDirectory, "assets"),
    },
    {
      language: "en",
      locale: "en",
      topic: "Generating and distributing AI content unsuitable for children and young people",
      reportDirectory: englishReportDirectory,
      assetsDirectory: path.join(englishReportDirectory, "assets"),
    },
  ];
  for (const edition of editions) {
    await fs.mkdir(edition.assetsDirectory, { recursive: true, mode: 0o755 });
    await fs.chmod(edition.reportDirectory, 0o755);
    await fs.chmod(edition.assetsDirectory, 0o755);
  }
  await fs.chmod(reportsDirectory, 0o755);

  const chartDefinitions = [
    { key: "keyStatements", base: "01-key-statements", width: 1440, height: 960, data: analysis.metrics, build: buildKeyStatementsSvg },
    { key: "pauseMap", base: "02-pause-map", width: 1440, height: 880, data: { metrics: analysis.metrics, voterCount: analysis.voterCount }, build: buildPauseMapSvg },
    { key: "themeMap", base: "03-theme-map", width: 1440, height: 880, data: analysis.metrics, build: buildThemeMapSvg },
    { key: "overlapMosaics", base: "04-overlap-mosaics", width: 1440, height: 900, data: { metrics: analysis.metrics, tensionOverlaps: analysis.tensionOverlaps }, build: buildTensionsSvg },
    { key: "coverage", base: "05-response-coverage", width: 1440, height: 800, data: analysis.metrics, build: buildCoverageSvg },
    { key: "opinionLandscape", base: "06-opinion-landscape", width: 1440, height: 900, data: groupAnalysis, build: buildOpinionLandscapeSvg },
  ];
  const obsoleteChartBases = ["01-support-coverage", "02-key-statements", "04-core-tensions", "06-opinion-groups", "06-group-stability"];
  for (const edition of editions) {
    for (const base of obsoleteChartBases) {
      await fs.rm(path.join(edition.assetsDirectory, base + ".svg"), { force: true });
      await fs.rm(path.join(edition.assetsDirectory, base + ".png"), { force: true });
    }
  }
  for (const edition of editions) {
    edition.svgs = {};
    for (const definition of chartDefinitions) {
      const svg = flattenSvg(definition.build(definition.data, edition.language));
      edition.svgs[definition.key] = buildEmbeddedSvg(svg);
      if (edition.language === "en") {
        assert(!/[\u3400-\u9FFF]/u.test(svg), "Untranslated Chinese text remains in " + definition.base + ".svg.");
      }
      await writeAggregateFile(path.join(edition.assetsDirectory, definition.base + ".svg"), svg);
    }
  }

  const chrome = await findChrome();
  const sips = await findSips();
  assert(chrome || sips, "Google Chrome, Chromium, or macOS sips is required to render PNG chart assets.");
  const chromeProfile = chrome ? await fs.mkdtemp(path.join(os.tmpdir(), "htr-report-chrome-")) : null;
  try {
    for (const edition of editions) {
      for (const definition of chartDefinitions) {
        const renderArguments = {
          svgPath: path.join(edition.assetsDirectory, definition.base + ".svg"),
          pngPath: path.join(edition.assetsDirectory, definition.base + ".png"),
        };
        if (edition.language === "en" && chrome) {
          await renderSvgPng({
            chrome,
            ...renderArguments,
            width: definition.width,
            height: definition.height,
            userDataDir: chromeProfile,
          });
        } else if (sips) {
          await renderSvgPngWithSips({ sips, ...renderArguments });
        } else {
          await renderSvgPng({
            chrome,
            ...renderArguments,
            width: definition.width,
            height: definition.height,
            userDataDir: chromeProfile,
          });
        }
        await fs.chmod(path.join(edition.assetsDirectory, definition.base + ".png"), 0o644);
      }
    }
  } finally {
    if (chromeProfile) await fs.rm(chromeProfile, { recursive: true, force: true });
  }

  const now = new Date();
  const extractedAt = raw.export_metadata?.generated_at_utc || raw.session.created_at;
  const sharedReportArguments = {
    sessionId: analysis.sessionId,
    voterCount: analysis.voterCount,
    totals: analysis.totals,
    metrics: analysis.metrics,
    tensionOverlaps: analysis.tensionOverlaps,
    groupAnalysis,
  };

  for (const edition of editions) {
    const english = edition.language === "en";
    const reportArguments = {
      ...sharedReportArguments,
      topic: edition.topic,
      svgs: edition.svgs,
      sessionCreatedDate: english ? formatReportDateEnglish(raw.session.created_at) : formatReportDate(raw.session.created_at),
      dataExtractedDate: english ? formatReportDateEnglish(extractedAt) : formatReportDate(extractedAt),
      generatedDate: english ? formatReportDateEnglish(now) : formatReportDate(now),
    };
    const reportHtml = english ? buildEnglishReportHtml(reportArguments) : buildReportHtml(reportArguments);
    await writeAggregateFile(path.join(edition.reportDirectory, "index.html"), reportHtml);

    const readme = english ? [
      "AI Safety Governance for Children and Young People | Aggregate Analysis Materials",
      "",
      "This folder contains aggregate charts and reporting only. It does not include names, participant identifiers or individual voting records.",
      "SVG files can be resized in presentation software without loss of quality. PNG files are 1,440 pixels wide and can be inserted directly into slides.",
      "When sharing these charts, explain that denominators differ across statements and that later statements received responses from a smaller share of participants.",
      "The opinion map shows aggregate, overlapping soft profiles. It does not publish individual positions, membership weights or group assignments.",
      "",
      "Full report: index.html",
      "Traditional Chinese report: ../index.html",
      "Charts: assets/",
      "",
    ].join("\n") : [
      "兒少 AI 安全治理｜彙整分析素材",
      "",
      "本資料夾僅含彙整後的圖表與報告，不含姓名、參與者識別碼或個別投票紀錄。",
      "SVG 適合在簡報軟體中縮放；PNG 為 1440 像素寬，可直接插入投影片。",
      "分享圖表時，請一併說明各題分母不同，且後段題目的作答覆蓋率較低。",
      "意見地圖只呈現彙整後、可重疊的柔性取向，不公布個人位置、傾向權重或分群歸屬。",
      "",
      "完整報告：index.html",
      "英文版報告：en/index.html",
      "圖表：assets/",
      "",
    ].join("\n");
    await writeAggregateFile(path.join(edition.reportDirectory, "README.txt"), readme);

    const outputFiles = ["index.html", "README.txt"];
    for (const definition of chartDefinitions) {
      outputFiles.push("assets/" + definition.base + ".svg");
      outputFiles.push("assets/" + definition.base + ".png");
    }
    const manifestFiles = [];
    for (const relativePath of outputFiles) {
      const buffer = await fs.readFile(path.join(edition.reportDirectory, relativePath));
      manifestFiles.push({
        file: relativePath,
        bytes: buffer.length,
        sha256: sha256(buffer),
      });
    }
    const manifest = {
      schemaVersion: 1,
      generatorVersion: VERSION,
      locale: edition.locale,
      session: analysis.sessionId,
      topic: edition.topic,
      aggregateOnly: true,
      counts: {
        participantsWithVotes: analysis.voterCount,
        statements: analysis.statements.length,
        responses: analysis.totals.responses,
        support: analysis.totals.support,
        neutral: analysis.totals.neutral,
        oppose: analysis.totals.oppose,
      },
      opinionGroupAnalysis: {
        method: groupAnalysis.method,
        status: groupAnalysis.status,
        eligibleParticipants: groupAnalysis.eligibleParticipants,
        excludedParticipants: groupAnalysis.excludedParticipants,
        minimumVotes: groupAnalysis.minimumVotes,
        explainedVariancePct: groupAnalysis.explainedVariancePct,
        pcaAxisVariancePct: groupAnalysis.pcaAxisVariancePct,
        softTendencyMethod: groupAnalysis.opinionTendencies.method,
        softTendencyCount: groupAnalysis.opinionTendencies.tendencyCount,
        softTendencyOverlapThreshold: groupAnalysis.opinionTendencies.overlapSummary.membershipThreshold,
        participantsWithMultipleSoftTendencies: groupAnalysis.opinionTendencies.overlapSummary.participantsWithMultipleTendencies,
        statementBootstrapMedianAdjustedRand: groupAnalysis.bootstrapMedianAri,
        statementBootstrapReplicates: groupAnalysis.bootstrapReplicates,
        statementBootstrapThresholdPasses: groupAnalysis.bootstrapPassCount,
      },
      files: manifestFiles,
    };
    await writeAggregateFile(path.join(edition.reportDirectory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  }

  process.stdout.write(
    "Generated Traditional Chinese and English aggregate-only reports for session " + analysis.sessionId + " at " + reportDirectory + "\n" +
    "Charts: " + (chartDefinitions.length * editions.length) + " SVG and " + (chartDefinitions.length * editions.length) + " PNG files\n" +
    "Opinion landscape: " + groupAnalysis.opinionTendencies.tendencyCount + " overlapping tendencies (" + groupAnalysis.eligibleParticipants + " eligible; hard partition " + groupAnalysis.status + ", bootstrap median ARI=" + (groupAnalysis.bootstrapMedianAri?.toFixed(3) ?? "n/a") + ")\n",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(error.stack + "\n");
    process.exitCode = 1;
  });
}
