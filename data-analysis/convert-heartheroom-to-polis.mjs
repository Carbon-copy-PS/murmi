import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { computeOpinionClusters } from "../frontend/src/utils/opinion-clusters.js";

const POLIS_VOTE = {
  strongly_agree: 1,
  agree: 1,
  neutral: 0,
  disagree: -1,
  strongly_disagree: -1,
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SESSIONS_DIR = path.join(SCRIPT_DIR, "sessions");
const CONVERTER_VERSION = "1.0.0";

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function csvCell(value, forceQuote = false) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (forceQuote || /[",\r\n]/.test(text)) {
    return '"' + text.replaceAll('"', '""') + '"';
  }
  return text;
}

function csvText(rows, forceQuoteColumns = new Set()) {
  return rows
    .map((row, rowIndex) => row
      .map((value, column) => csvCell(value, rowIndex > 0 && forceQuoteColumns.has(column)))
      .join(","))
    .join("\n") + "\n";
}

function twoDigits(value) {
  return String(value).padStart(2, "0");
}

function polisDateTime(timestamp) {
  const date = new Date(timestamp * 1000);
  assert(!Number.isNaN(date.valueOf()), "Invalid statement timestamp: " + timestamp);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return [
    weekdays[date.getUTCDay()],
    months[date.getUTCMonth()],
    twoDigits(date.getUTCDate()),
    date.getUTCFullYear(),
    twoDigits(date.getUTCHours()) + ":" + twoDigits(date.getUTCMinutes()) + ":" + twoDigits(date.getUTCSeconds()),
    "GMT+0000 (Coordinated Universal Time)",
  ].join(" ");
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function groupLetter(groupId) {
  assert(Number.isInteger(groupId) && groupId >= 0 && groupId < 26, "Unsupported group id: " + groupId);
  return String.fromCharCode("a".charCodeAt(0) + groupId);
}

function sortStatements(statements) {
  return [...statements].sort((left, right) => {
    const timeDifference = Number(left.created_at) - Number(right.created_at);
    if (timeDifference !== 0) return timeDifference;
    return String(left.id).localeCompare(String(right.id));
  });
}

function normalizeSource(source) {
  assert(source && typeof source === "object", "Raw export must be a JSON object.");
  assert(source.session && typeof source.session === "object", "Raw export is missing session metadata.");
  assert(Array.isArray(source.statements), "Raw export is missing statements.");
  assert(Array.isArray(source.participants), "Raw export is missing participants.");
  assert(Array.isArray(source.votes), "Raw export is missing votes.");

  const sessionId = String(source.session.id || "").trim();
  assert(sessionId, "Raw export session id is missing.");

  const statements = sortStatements(source.statements);
  const statementIds = new Set();
  for (const statement of statements) {
    const statementId = String(statement.id || "").trim();
    assert(statementId, "A statement id is missing.");
    assert(String(statement.session_id || "") === sessionId, "Statement " + statementId + " belongs to another session.");
    assert(!statementIds.has(statementId), "Duplicate statement id: " + statementId);
    assert(typeof statement.text === "string" && statement.text.trim(), "Statement " + statementId + " has no text.");
    assert(Number.isFinite(Number(statement.created_at)), "Statement " + statementId + " has an invalid created_at.");
    statementIds.add(statementId);
  }

  const participantIds = new Set();
  for (const participant of source.participants) {
    const participantId = String(participant.id || "").trim();
    assert(participantId, "A participant id is missing.");
    assert(String(participant.session_id || "") === sessionId, "Participant " + participantId + " belongs to another session.");
    assert(!participantIds.has(participantId), "Duplicate participant id: " + participantId);
    participantIds.add(participantId);
  }

  const pairKeys = new Set();
  const voters = new Set();
  for (const vote of source.votes) {
    const statementId = String(vote.statement_id || "").trim();
    const participantId = String(vote.participant_id || "").trim();
    assert(String(vote.session_id || "") === sessionId, "A vote belongs to another session.");
    assert(statementIds.has(statementId), "Vote references unknown statement: " + statementId);
    assert(participantIds.has(participantId), "Vote references unknown participant: " + participantId);
    assert(Object.hasOwn(POLIS_VOTE, vote.vote), "Unsupported vote value: " + vote.vote);
    const pairKey = participantId + "\u0000" + statementId;
    assert(!pairKeys.has(pairKey), "Duplicate participant/statement vote without history timestamps.");
    pairKeys.add(pairKey);
    voters.add(participantId);
  }

  return {
    sessionId,
    statements,
    statementIds,
    participantIds,
    votes: source.votes,
    voters: [...voters].sort((left, right) => left.localeCompare(right)),
  };
}

function buildConversion(source) {
  const normalized = normalizeSource(source);
  const commentIdByStatementId = new Map(
    normalized.statements.map((statement, index) => [String(statement.id), index]),
  );
  const participantNumberByRawId = new Map(
    normalized.voters.map((participantId, index) => [participantId, index + 1]),
  );

  const votesByParticipant = new Map(
    normalized.voters.map((participantId) => [participantId, new Map()]),
  );
  for (const vote of normalized.votes) {
    votesByParticipant
      .get(String(vote.participant_id))
      .set(String(vote.statement_id), String(vote.vote));
  }

  const clusterVoters = normalized.voters.map((participantId) => ({
    key: String(participantNumberByRawId.get(participantId)),
    isYou: false,
    votes: Object.fromEntries(votesByParticipant.get(participantId)),
  }));
  const cluster = computeOpinionClusters({
    statements: normalized.statements.map((statement) => ({
      id: String(statement.id),
      text: statement.text,
      custom: Boolean(statement.custom),
    })),
    voters: clusterVoters,
    voteType: source.session.vote_type || "binary",
  });
  assert(cluster.ok, "The session does not have enough data to compute HTR-derived groups.");

  const groupByParticipantNumber = new Map(
    cluster.points.map((point) => [Number(point.key), Number(point.cluster)]),
  );
  const groupIds = cluster.clusters.map((group) => Number(group.id)).sort((left, right) => left - right);
  assert(groupByParticipantNumber.size === normalized.voters.length, "Not every voter received an HTR group.");

  const currentCountsByStatement = new Map(
    normalized.statements.map((statement) => [
      String(statement.id),
      { agree: 0, disagree: 0, pass: 0 },
    ]),
  );
  for (const vote of normalized.votes) {
    const value = POLIS_VOTE[vote.vote];
    const counts = currentCountsByStatement.get(String(vote.statement_id));
    if (value === 1) counts.agree += 1;
    else if (value === -1) counts.disagree += 1;
    else counts.pass += 1;
  }

  const commentsRows = [[
    "timestamp",
    "datetime",
    "comment-id",
    "author-id",
    "agrees",
    "disagrees",
    "moderated",
    "comment-body",
  ]];
  for (const statement of normalized.statements) {
    const timestamp = Math.floor(Number(statement.created_at));
    const counts = currentCountsByStatement.get(String(statement.id));
    commentsRows.push([
      timestamp,
      polisDateTime(timestamp),
      commentIdByStatementId.get(String(statement.id)),
      0,
      counts.agree,
      counts.disagree,
      statement.approved ? 1 : 0,
      statement.text,
    ]);
  }

  const participantHeader = [
    "participant",
    "group-id",
    "n-comments",
    "n-votes",
    "n-agree",
    "n-disagree",
    ...normalized.statements.map((statement) => commentIdByStatementId.get(String(statement.id))),
  ];
  const participantRows = [participantHeader];
  const participantRowsWithHtrGroups = [participantHeader];
  for (const participantId of normalized.voters) {
    const participantNumber = participantNumberByRawId.get(participantId);
    const participantVotes = votesByParticipant.get(participantId);
    const cells = normalized.statements.map((statement) => {
      const vote = participantVotes.get(String(statement.id));
      return vote === undefined ? "" : POLIS_VOTE[vote];
    });
    const row = [
      participantNumber,
      "",
      0,
      cells.filter((value) => value !== "").length,
      cells.filter((value) => value === 1).length,
      cells.filter((value) => value === -1).length,
      ...cells,
    ];
    participantRows.push(row);
    const groupedRow = [...row];
    groupedRow[1] = groupByParticipantNumber.get(participantNumber);
    participantRowsWithHtrGroups.push(groupedRow);
  }

  const commentGroupsHeader = [
    "comment-id",
    "comment",
    "total-votes",
    "total-agrees",
    "total-disagrees",
    "total-passes",
  ];
  for (const groupId of groupIds) {
    const letter = groupLetter(groupId);
    commentGroupsHeader.push(
      "group-" + letter + "-votes",
      "group-" + letter + "-agrees",
      "group-" + letter + "-disagrees",
      "group-" + letter + "-passes",
    );
  }
  const commentGroupsRows = [commentGroupsHeader];

  for (const statement of normalized.statements) {
    const byGroup = new Map(
      groupIds.map((groupId) => [groupId, { votes: 0, agrees: 0, disagrees: 0, passes: 0 }]),
    );
    for (const participantId of normalized.voters) {
      const rawVote = votesByParticipant.get(participantId).get(String(statement.id));
      if (rawVote === undefined) continue;
      const participantNumber = participantNumberByRawId.get(participantId);
      const groupId = groupByParticipantNumber.get(participantNumber);
      const value = POLIS_VOTE[rawVote];
      const counts = byGroup.get(groupId);
      counts.votes += 1;
      if (value === 1) counts.agrees += 1;
      else if (value === -1) counts.disagrees += 1;
      else counts.passes += 1;
    }

    const total = { votes: 0, agrees: 0, disagrees: 0, passes: 0 };
    for (const counts of byGroup.values()) {
      total.votes += counts.votes;
      total.agrees += counts.agrees;
      total.disagrees += counts.disagrees;
      total.passes += counts.passes;
    }
    const row = [
      commentIdByStatementId.get(String(statement.id)),
      statement.text,
      total.votes,
      total.agrees,
      total.disagrees,
      total.passes,
    ];
    for (const groupId of groupIds) {
      const counts = byGroup.get(groupId);
      row.push(counts.votes, counts.agrees, counts.disagrees, counts.passes);
    }
    commentGroupsRows.push(row);
  }

  const totals = [...currentCountsByStatement.values()].reduce(
    (result, counts) => ({
      agree: result.agree + counts.agree,
      disagree: result.disagree + counts.disagree,
      pass: result.pass + counts.pass,
    }),
    { agree: 0, disagree: 0, pass: 0 },
  );

  const nonblankMatrixCells = participantRows
    .slice(1)
    .reduce((sum, row) => sum + row.slice(6).filter((value) => value !== "").length, 0);
  assert(nonblankMatrixCells === normalized.votes.length, "Vote matrix does not reconcile to raw final votes.");
  assert(totals.agree + totals.disagree + totals.pass === normalized.votes.length, "Collapsed vote totals do not reconcile.");

  for (const row of participantRows.slice(1)) {
    const cells = row.slice(6);
    assert(row[3] === cells.filter((value) => value !== "").length, "Participant n-votes mismatch.");
    assert(row[4] === cells.filter((value) => value === 1).length, "Participant n-agree mismatch.");
    assert(row[5] === cells.filter((value) => value === -1).length, "Participant n-disagree mismatch.");
  }
  for (const row of commentGroupsRows.slice(1)) {
    assert(row[2] === row[3] + row[4] + row[5], "Comment total vote partition mismatch.");
    let summedGroups = 0;
    for (let offset = 6; offset < row.length; offset += 4) {
      assert(row[offset] === row[offset + 1] + row[offset + 2] + row[offset + 3], "Group vote partition mismatch.");
      summedGroups += row[offset];
    }
    assert(row[2] === summedGroups, "Comment total does not equal grouped votes.");
  }

  return {
    normalized,
    commentsRows,
    participantRows,
    participantRowsWithHtrGroups,
    commentGroupsRows,
    totals,
    groupIds,
    cluster,
  };
}

async function ensurePrivateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
}

async function writePrivateFile(filename, contents) {
  await fs.writeFile(filename, contents, { mode: 0o600 });
  await fs.chmod(filename, 0o600);
}

async function main() {
  const inputArgument = process.argv[2];
  if (!inputArgument || inputArgument === "--help" || inputArgument === "-h") {
    console.error("Usage: node data-analysis/convert-heartheroom-to-polis.mjs <raw-json> [sessions-directory]");
    process.exitCode = inputArgument ? 0 : 2;
    return;
  }

  const inputPath = path.resolve(inputArgument);
  const sessionsDirectory = path.resolve(process.argv[3] || DEFAULT_SESSIONS_DIR);
  const sourceBuffer = await fs.readFile(inputPath);
  const source = JSON.parse(sourceBuffer.toString("utf8"));
  const conversion = buildConversion(source);

  const sessionDirectory = path.join(sessionsDirectory, conversion.normalized.sessionId);
  const rawDirectory = path.join(sessionDirectory, "raw");
  const polisDirectory = path.join(sessionDirectory, "polis");
  const htrDerivedDirectory = path.join(polisDirectory, "htr-derived");
  await ensurePrivateDirectory(sessionsDirectory);
  await ensurePrivateDirectory(sessionDirectory);
  await ensurePrivateDirectory(rawDirectory);
  await ensurePrivateDirectory(polisDirectory);
  await ensurePrivateDirectory(htrDerivedDirectory);

  const rawCopyPath = path.join(rawDirectory, path.basename(inputPath));
  if (path.resolve(rawCopyPath) !== inputPath) {
    await fs.copyFile(inputPath, rawCopyPath);
  }
  await fs.chmod(rawCopyPath, 0o600);
  const copiedBuffer = await fs.readFile(rawCopyPath);
  assert(sha256(copiedBuffer) === sha256(sourceBuffer), "Raw copy SHA-256 mismatch.");

  const commentsFilename = conversion.normalized.sessionId + "-comments.csv";
  const participantVotesFilename = conversion.normalized.sessionId + "-participant-votes.csv";
  const commentGroupsFilename = conversion.normalized.sessionId + "-comment-groups.csv";
  const commentsText = csvText(conversion.commentsRows, new Set([7]));
  const participantVotesText = csvText(conversion.participantRows);
  const participantVotesWithHtrGroupsText = csvText(conversion.participantRowsWithHtrGroups);
  const commentGroupsText = csvText(conversion.commentGroupsRows, new Set([1]));

  const sensitiveIdentifiers = [
    ...source.participants.map((participant) => String(participant.id || "")).filter(Boolean),
    ...source.participants.map((participant) => String(participant.client_id || "")).filter(Boolean),
  ];
  for (const [filename, contents] of [
    [commentsFilename, commentsText],
    [participantVotesFilename, participantVotesText],
    ["htr-derived/" + participantVotesFilename, participantVotesWithHtrGroupsText],
    [commentGroupsFilename, commentGroupsText],
  ]) {
    for (const identifier of sensitiveIdentifiers) {
      assert(!contents.includes(identifier), filename + " contains a raw participant/client identifier.");
    }
  }

  await writePrivateFile(path.join(polisDirectory, commentsFilename), commentsText);
  await writePrivateFile(path.join(polisDirectory, participantVotesFilename), participantVotesText);
  await writePrivateFile(
    path.join(htrDerivedDirectory, participantVotesFilename),
    participantVotesWithHtrGroupsText,
  );
  await writePrivateFile(
    path.join(htrDerivedDirectory, commentGroupsFilename),
    commentGroupsText,
  );

  const participantCount = conversion.normalized.voters.length;
  const statementCount = conversion.normalized.statements.length;
  const metadata = {
    schema_version: 1,
    converter_version: CONVERTER_VERSION,
    generated_at: new Date().toISOString(),
    source: {
      filename: path.basename(rawCopyPath),
      sha256: sha256(sourceBuffer),
      session_id: conversion.normalized.sessionId,
      public_id: source.session.public_id || null,
      topic: source.session.topic || null,
      vote_type: source.session.vote_type || null,
    },
    outputs: {
      comments: {
        filename: commentsFilename,
        sha256: sha256(Buffer.from(commentsText, "utf8")),
      },
      participant_votes: {
        filename: participantVotesFilename,
        sha256: sha256(Buffer.from(participantVotesText, "utf8")),
      },
      htr_derived: {
        participant_votes: {
          filename: "htr-derived/" + participantVotesFilename,
          sha256: sha256(Buffer.from(participantVotesWithHtrGroupsText, "utf8")),
        },
        comment_groups: {
          filename: "htr-derived/" + commentGroupsFilename,
          sha256: sha256(Buffer.from(commentGroupsText, "utf8")),
        },
      },
    },
    counts: {
      statements: statementCount,
      registered_participants: source.participants.length,
      voting_participants: participantCount,
      registered_non_voters: source.participants.length - participantCount,
      final_votes: conversion.normalized.votes.length,
      agrees: conversion.totals.agree,
      disagrees: conversion.totals.disagree,
      passes: conversion.totals.pass,
      no_vote_cells: participantCount * statementCount - conversion.normalized.votes.length,
      opinion_groups: conversion.groupIds.length,
      group_sizes: conversion.cluster.clusters.map((group) => ({
        group_id: group.id,
        participants: group.size,
      })),
    },
    transformation: {
      comment_order: "statement.created_at ascending, then statement.id",
      participant_order: "raw participant_id lexical order; raw ids are not exported",
      vote_mapping: POLIS_VOTE,
      missing_vote: "blank",
      author_id: "0 (source author linkage is not persisted)",
      n_comments: "0 (source author linkage is not persisted)",
      moderation: "approved=true -> 1; approved=false -> 0",
      comment_vote_counts: "current final-vote snapshot, not vote-event history",
      grouping: {
        primary_participant_votes_group_id: "blank",
        engine: "HearTheRoom frontend/src/utils/opinion-clusters.js",
        native_polis: false,
        method: "five-point weighting, PCA to 2D, k-means, silhouette-selected k=2..4",
        pca_missing_and_neutral_value: 0,
        exported_matrix_scale: "ternary -1/0/1",
        low_activity_voters_excluded: false,
        all_voters_assigned: true,
      },
    },
    warnings: [
      "Five-point vote intensity is collapsed to Pol.is-compatible ternary values.",
      "Neutral is represented as Pol.is pass/unsure (0), which is a semantic approximation.",
      "Author linkage, prior comment text, vote timestamps, revisions, and undo history are unavailable.",
      "Group assignments and comment-groups are HTR-derived, not native Pol.is analysis output.",
      "The generated files are report-shaped CSVs and are not guaranteed to be accepted as a hosted Pol.is upload.",
    ],
  };
  await writePrivateFile(
    path.join(polisDirectory, "conversion-metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );

  console.log(JSON.stringify({
    session_id: conversion.normalized.sessionId,
    output_directory: polisDirectory,
    htr_derived_directory: htrDerivedDirectory,
    statements: statementCount,
    voting_participants: participantCount,
    final_votes: conversion.normalized.votes.length,
    agrees: conversion.totals.agree,
    passes: conversion.totals.pass,
    disagrees: conversion.totals.disagree,
    no_vote_cells: participantCount * statementCount - conversion.normalized.votes.length,
    groups: conversion.cluster.clusters.map((group) => group.size),
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
