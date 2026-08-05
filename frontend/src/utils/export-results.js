import { APP_NAME } from '../constants/app'

const GROUP_LETTERS = ['A', 'B', 'C', 'D']

const LIKERT_KEYS = ['strongly_disagree', 'disagree', 'neutral', 'agree', 'strongly_agree']

const LIKERT_LABELS = {
  strongly_disagree: 'Strongly disagree',
  disagree: 'Disagree',
  neutral: 'Neutral',
  agree: 'Agree',
  strongly_agree: 'Strongly agree',
}

const LIKERT_CLS = {
  strongly_disagree: 'sd',
  disagree: 'd',
  neutral: 'n',
  agree: 'a',
  strongly_agree: 'sa',
}

const BINARY_VOTE_KEYS = ['agree', 'disagree', 'neutral']

const BINARY_VOTE_LABELS = {
  agree: 'Agree',
  disagree: 'Disagree',
  neutral: 'Neutral',
}

function voteOptionKeys(voteType = 'binary') {
  return voteType === 'likert' ? LIKERT_KEYS : BINARY_VOTE_KEYS
}

function voteOptionLabel(key, voteType = 'binary', tr) {
  if (typeof tr === 'function') {
    if (voteType === 'likert' && LIKERT_LABEL_KEYS[key]) {
      return tr(LIKERT_LABEL_KEYS[key], LIKERT_LABELS[key])
    }
    if (voteType !== 'likert' && BINARY_VOTE_LABELS[key]) {
      return tr(`common.${key === 'neutral' ? 'neutral' : key}`, BINARY_VOTE_LABELS[key])
    }
  }
  if (voteType === 'likert') return LIKERT_LABELS[key] || key
  return BINARY_VOTE_LABELS[key] || key
}

function emptyVoteCounts(voteType = 'binary') {
  return Object.fromEntries(voteOptionKeys(voteType).map((k) => [k, 0]))
}

function aggregateVotesByStatement(statements, voters, voteType = 'binary') {
  const keys = voteOptionKeys(voteType)
  return (statements || []).map((stmt) => {
    const counts = emptyVoteCounts(voteType)
    for (const voter of voters || []) {
      const vote = voter.votes?.[stmt.id]
      if (vote && keys.includes(vote)) counts[vote] += 1
    }
    const total = keys.reduce((sum, key) => sum + counts[key], 0)
    return { id: stmt.id, text: stmt.text, counts, total }
  })
}

function pct(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0
}

function makeTr(t) {
  return (key, fallback, opts) => {
    if (typeof t === 'function') {
      const value = t(key, opts)
      if (value && value !== key) return value
    }
    let out = String(fallback ?? '')
    if (opts) {
      for (const [k, v] of Object.entries(opts)) {
        out = out.split(`{{${k}}}`).join(String(v))
      }
    }
    return out
  }
}

const LIKERT_LABEL_KEYS = {
  strongly_disagree: 'common.stronglyDisagree',
  disagree: 'common.disagree',
  neutral: 'common.neutral',
  agree: 'common.agree',
  strongly_agree: 'common.stronglyAgree',
}

function formatDate(ts, lang = 'en') {
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts * 1000))
  } catch {
    return new Date(ts * 1000).toLocaleString()
  }
}

function groupRows(cluster, voteType = 'binary') {
  if (!cluster?.groups?.length) return []
  const likert = voteType === 'likert'
  return cluster.groups.map((g) => ({
    group: GROUP_LETTERS[g.id],
    size: g.size,
    sharePct: pct(g.size, cluster.voterCount),
    agree: (g.agree || []).map((s) => s.text),
    disagree: (g.disagree || []).map((s) => s.text),
    stronglyAgree: likert ? (g.stronglyAgree || []).map((s) => s.text) : [],
    stronglyDisagree: likert ? (g.stronglyDisagree || []).map((s) => s.text) : [],
  }))
}

function statementResults(list, voteType = 'binary') {
  const likert = voteType === 'likert'
  return (list || []).map((s) => {
    const base = {
      text: s.text,
      agree: s.agree || 0,
      disagree: s.disagree || 0,
    }
    if (likert && s.dist) {
      return {
        ...base,
        responded: s.responded || 0,
        distribution: { ...s.dist },
      }
    }
    return base
  })
}

function formatLikertLine(s, tr) {
  const total = s.responded || LIKERT_KEYS.reduce((n, k) => n + (s.distribution?.[k] || 0), 0)
  const parts = LIKERT_KEYS
    .filter((k) => (s.distribution?.[k] || 0) > 0)
    .map((k) => `${tr(LIKERT_LABEL_KEYS[k], LIKERT_LABELS[k])} ${s.distribution[k]} (${pct(s.distribution[k], total)}%)`)
  return parts.join(' · ')
}

function getCommonGroundHistory(ctx) {
  if (Array.isArray(ctx.commonGroundHistory) && ctx.commonGroundHistory.length) {
    return ctx.commonGroundHistory
  }
  if (ctx.commonGround?.groupStatement) return [ctx.commonGround]
  return []
}

function commonGroundBlock(commonGround) {
  if (!commonGround?.groupStatement) return null
  const v = commonGround.votes
  const total = v ? (v.agree || 0) + (v.disagree || 0) : 0
  const agreePct = total ? pct(v.agree, total) : 0
  return {
    id: commonGround.id,
    generatedAt: commonGround.generatedAt,
    generatedByName: commonGround.generatedByName,
    depth: commonGround.depth || 'basic',
    statement: commonGround.groupStatement,
    bridgingProposal: (commonGround.bridgingProposal || '').trim(),
    bridgingAlternatives: (commonGround.bridgingAlternatives || []).filter(Boolean),
    sharedGround: (commonGround.commonGround || []).filter(Boolean),
    openTensions: (commonGround.divides || []).filter(Boolean),
    insights: (commonGround.insights || []).filter(Boolean),
    tradeoffs: (commonGround.tradeoffs || []).filter(Boolean),
    groupNotes: (commonGround.groupNotes || []).filter((g) => g?.group && g?.note),
    vote: total
      ? { agree: v.agree, disagree: v.disagree, agreePct, disagreePct: 100 - agreePct }
      : null,
  }
}

function csvCell(value) {
  const str = String(value ?? '')
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function buildCSV(ctx) {
  const { topic, sessionId, cluster, voteType = 'binary' } = ctx
  const tr = makeTr(ctx.t)
  const cgHistory = getCommonGroundHistory(ctx)
  const likert = voteType === 'likert'
  const lines = []
  const row = (...cells) => lines.push(cells.map(csvCell).join(','))

  row(`${APP_NAME} — Results`)
  row('Topic', topic || 'Untitled session')
  if (sessionId) row('Session', sessionId)
  if (cluster?.voterCount != null) row('Participants', cluster.voterCount)
  if (cluster?.k != null) row('Opinion groups', cluster.k)
  if (likert) row('Vote type', 'Likert (5-point)')

  cgHistory.forEach((item, index) => {
  const cg = commonGroundBlock(item)
  if (!cg) return
    lines.push('')
    row(`AI common ground v${index + 1}`)
    row('Field', 'Value')
    if (cg.generatedAt) row('Generated at', new Date(cg.generatedAt * 1000).toISOString())
    if (cg.generatedByName) row('Generated by', cg.generatedByName)
    row('Analysis depth', tr(`cgDepth.${cg.depth}.label`, cg.depth))
    row('Statement', cg.statement)
    if (cg.bridgingProposal) row('Bridging proposal', cg.bridgingProposal)
    cg.bridgingAlternatives.forEach((t) => row('Alternative bridge', t))
    cg.sharedGround.forEach((t) => row('Shared ground', t))
    cg.openTensions.forEach((t) => row('Open tension', t))
    cg.insights.forEach((t) => row('Insight', t))
    cg.tradeoffs.forEach((t) => row('Trade-off', t))
    cg.groupNotes.forEach((g) => row(`Group ${g.group}`, g.note))
    if (cg.vote) {
      row('Agree votes', `${cg.vote.agree} (${cg.vote.agreePct}%)`)
      row('Disagree votes', `${cg.vote.disagree} (${cg.vote.disagreePct}%)`)
    } else {
      row('Votes', 'No votes yet')
    }
  })

  const groups = groupRows(cluster, voteType)
  if (groups.length) {
    lines.push('')
    row('Opinion groups')
    row('Group', 'Size', 'Share %')
    groups.forEach((g) => row(g.group, g.size, g.sharePct))

    lines.push('')
    row('Group positions')
    row('Group', 'Stance', 'Statement')
    groups.forEach((g) => {
      if (likert) {
        g.stronglyAgree.forEach((t) => row(g.group, 'Strongly agree on', t))
        g.agree.forEach((t) => row(g.group, 'Agree on', t))
        g.stronglyDisagree.forEach((t) => row(g.group, 'Strongly disagree on', t))
        g.disagree.forEach((t) => row(g.group, 'Disagree on', t))
      } else {
        g.agree.forEach((t) => row(g.group, 'Tend to agree', t))
        g.disagree.forEach((t) => row(g.group, 'Tend to disagree', t))
      }
    })
  }

  const consensus = statementResults(cluster?.consensus, voteType)
  const divisive = statementResults(cluster?.divisive, voteType)
  if (consensus.length || divisive.length) {
    lines.push('')
    row('Statement results')
    if (likert) {
      row('Category', 'Statement', 'Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree')
      consensus.forEach((s) => row(
        'Common ground',
        s.text,
        s.distribution?.strongly_disagree || 0,
        s.distribution?.disagree || 0,
        s.distribution?.neutral || 0,
        s.distribution?.agree || 0,
        s.distribution?.strongly_agree || 0,
      ))
      divisive.forEach((s) => row(
        'Most divisive',
        s.text,
        s.distribution?.strongly_disagree || 0,
        s.distribution?.disagree || 0,
        s.distribution?.neutral || 0,
        s.distribution?.agree || 0,
        s.distribution?.strongly_agree || 0,
      ))
    } else {
      row('Category', 'Statement', 'Agree', 'Disagree')
      consensus.forEach((s) => row('Common ground', s.text, s.agree, s.disagree))
      divisive.forEach((s) => row('Most divisive', s.text, s.agree, s.disagree))
    }
  }

  return lines.join('\n')
}

export function buildJSON(ctx) {
  const { topic, sessionId, cluster, voteType = 'binary' } = ctx
  const tr = makeTr(ctx.t)
  const cgHistory = getCommonGroundHistory(ctx)
  const likert = voteType === 'likert'
  const data = {
    topic: topic || null,
    session: sessionId || null,
    participants: cluster?.voterCount ?? null,
    opinionGroups: cluster?.k ?? null,
    voteType: likert ? 'likert' : 'binary',
  }

  const cgBlocks = cgHistory.map(commonGroundBlock).filter(Boolean)
  if (cgBlocks.length) {
    data.aiCommonGroundHistory = cgBlocks.map((cg) => {
      const entry = {
        id: cg.id,
        generatedAt: cg.generatedAt,
        generatedByName: cg.generatedByName,
        depth: tr(`cgDepth.${cg.depth}.label`, cg.depth),
        statement: cg.statement,
      }
      if (cg.bridgingProposal) entry.bridgingProposal = cg.bridgingProposal
      if (cg.bridgingAlternatives.length) entry.bridgingAlternatives = cg.bridgingAlternatives
      if (cg.sharedGround.length) entry.sharedGround = cg.sharedGround
      if (cg.openTensions.length) entry.openTensions = cg.openTensions
      if (cg.insights.length) entry.insights = cg.insights
      if (cg.tradeoffs.length) entry.tradeoffs = cg.tradeoffs
      if (cg.groupNotes.length) entry.groupNotes = cg.groupNotes
      if (cg.vote) entry.vote = cg.vote
      return entry
    })
  }

  const groups = groupRows(cluster, voteType)
  if (groups.length) {
    data.opinionGroupBreakdown = groups.map((g) => {
      const entry = {
        group: g.group,
        size: g.size,
        share: `${g.sharePct}%`,
      }
      if (likert) {
        entry.stronglyAgreeOn = g.stronglyAgree
        entry.agreeOn = g.agree
        entry.stronglyDisagreeOn = g.stronglyDisagree
        entry.disagreeOn = g.disagree
      } else {
        entry.tendToAgree = g.agree
        entry.tendToDisagree = g.disagree
      }
      return entry
    })
  }

  const consensus = statementResults(cluster?.consensus, voteType)
  if (consensus.length) data.commonGround = consensus

  const divisive = statementResults(cluster?.divisive, voteType)
  if (divisive.length) data.mostDivisive = divisive

  return JSON.stringify(data, null, 2)
}

export function buildSummary(ctx) {
  const { topic, sessionId, cluster, voteType = 'binary', lang = 'en' } = ctx
  const tr = makeTr(ctx.t)
  const cgHistory = getCommonGroundHistory(ctx)
  const likert = voteType === 'likert'
  const out = []

  out.push(`${APP_NAME.toUpperCase()} — ${tr('export.results', 'Results').toUpperCase()}`)
  out.push('======================')
  out.push('')
  out.push(`${tr('room.topic', 'Topic')}: ${topic || tr('export.untitled', 'Untitled session')}`)
  if (sessionId) out.push(`${tr('export.session', 'Session')}: ${sessionId}`)
  if (cluster?.voterCount != null) {
    const bits = [tr('export.participants', '{{count}} participants', { count: cluster.voterCount })]
    if (cluster.k != null) bits.push(tr('export.opinionGroups', '{{count}} opinion groups', { count: cluster.k }))
    if (likert) bits.push(tr('export.likertScale', 'Likert scale'))
    out.push(bits.join(' · '))
  }

  cgHistory.forEach((item, index) => {
    const cg = commonGroundBlock(item)
    if (!cg) return
    out.push('', tr('export.aiCommonGround', 'AI Common Ground v{{n}}', { n: index + 1 }).toUpperCase(), '----------------', cg.statement)
    if (cg.generatedAt) out.push(`${tr('export.generated', 'Generated')}: ${formatDate(cg.generatedAt, lang)}`)
    if (cg.generatedByName) out.push(tr('export.by', 'by {{name}}', { name: cg.generatedByName }))
    if (cg.bridgingProposal) out.push('', `${tr('cg.bridgingProposal', 'Bridging proposal')}: ${cg.bridgingProposal}`)
    if (cg.sharedGround.length) {
      out.push('', `${tr('cg.sharedGround', 'Shared ground')}:`)
      cg.sharedGround.forEach((t) => out.push(`  • ${t}`))
    }
    if (cg.openTensions.length) {
      out.push('', `${tr('cg.openTensions', 'Open tensions')}:`)
      cg.openTensions.forEach((t) => out.push(`  • ${t}`))
    }
    out.push('', cg.vote
      ? `${tr('export.vote', 'Vote')}: ${tr('export.agreePct', '{{count}} agree ({{pct}}%)', { count: cg.vote.agree, pct: cg.vote.agreePct })} · ${tr('export.disagreePct', '{{count}} disagree ({{pct}}%)', { count: cg.vote.disagree, pct: cg.vote.disagreePct })}`
      : `${tr('export.vote', 'Vote')}: ${tr('results.noVotesYet', 'No votes yet')}`)
  })

  const groups = groupRows(cluster, voteType)
  if (groups.length) {
    out.push('', tr('export.opinionGroupsTitle', 'Opinion Groups').toUpperCase(), '--------------')
    groups.forEach((g) => {
      out.push(`${tr('results.groupLabel', 'Group {{letter}}', { letter: g.group })} — ${tr('results.person', '{{count}} people', { count: g.size })} (${g.sharePct}%)`)
      const hasPositions = likert
        ? g.stronglyAgree.length || g.agree.length || g.stronglyDisagree.length || g.disagree.length
        : g.agree.length || g.disagree.length
      if (!hasPositions) {
        out.push(`  ${tr('results.noSharedPositions', 'No strong shared positions yet.')}`)
      } else if (likert) {
        if (g.stronglyAgree.length) {
          out.push(`  ${tr('stances.stronglyAgreeOn', 'Strongly agree on')}:`)
          g.stronglyAgree.forEach((t) => out.push(`    • ${t}`))
        }
        if (g.agree.length) {
          out.push(`  ${tr('stances.agreeOn', 'Agree on')}:`)
          g.agree.forEach((t) => out.push(`    • ${t}`))
        }
        if (g.stronglyDisagree.length) {
          out.push(`  ${tr('stances.stronglyDisagreeOn', 'Strongly disagree on')}:`)
          g.stronglyDisagree.forEach((t) => out.push(`    • ${t}`))
        }
        if (g.disagree.length) {
          out.push(`  ${tr('stances.disagreeOn', 'Disagree on')}:`)
          g.disagree.forEach((t) => out.push(`    • ${t}`))
        }
      } else {
        if (g.agree.length) {
          out.push(`  ${tr('stances.tendToAgree', 'Tend to agree')}:`)
          g.agree.forEach((t) => out.push(`    • ${t}`))
        }
        if (g.disagree.length) {
          out.push(`  ${tr('stances.tendToDisagree', 'Tend to disagree')}:`)
          g.disagree.forEach((t) => out.push(`    • ${t}`))
        }
      }
      out.push('')
    })
  }

  const consensus = statementResults(cluster?.consensus, voteType)
  if (consensus.length) {
    out.push(tr('results.commonGround', 'Common ground').toUpperCase(), '-------------')
    consensus.forEach((s) => {
      if (likert && s.distribution) {
        out.push(`  • ${s.text}`)
        out.push(`    ${formatLikertLine(s, tr)}`)
      } else {
        out.push(`  • ${s.text} — ${tr('results.countAgree', '{{count}} agree', { count: s.agree })} / ${tr('results.countDisagree', '{{count}} disagree', { count: s.disagree })}`)
      }
    })
    out.push('')
  }

  const divisive = statementResults(cluster?.divisive, voteType)
  if (divisive.length) {
    out.push(tr('results.mostDivisive', 'Most divisive').toUpperCase(), '-------------')
    divisive.forEach((s) => {
      if (likert && s.distribution) {
        out.push(`  • ${s.text}`)
        out.push(`    ${formatLikertLine(s, tr)}`)
      } else {
        out.push(`  • ${s.text} — ${tr('results.countAgree', '{{count}} agree', { count: s.agree })} / ${tr('results.countDisagree', '{{count}} disagree', { count: s.disagree })}`)
      }
    })
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function divergingBar(agree, disagree, tr) {
  const total = agree + disagree || 1
  const a = Math.round((agree / total) * 100)
  const d = 100 - a
  return `<div class="pdf-bar"><span class="pdf-bar-a" style="width:${a}%"></span><span class="pdf-bar-d" style="width:${d}%"></span></div>
    <div class="pdf-bar-meta"><span class="a">${esc(tr('results.countAgree', '{{count}} agree', { count: agree }))}</span><span class="d">${esc(tr('results.countDisagree', '{{count}} disagree', { count: disagree }))}</span></div>`
}

function likertBar(dist, responded, tr) {
  const total = responded || LIKERT_KEYS.reduce((n, k) => n + (dist?.[k] || 0), 0) || 1
  const segs = LIKERT_KEYS
    .filter((k) => (dist?.[k] || 0) > 0)
    .map((k) => {
      const count = dist[k]
      const width = Math.round((count / total) * 100)
      return `<span class="pdf-likert-seg ${LIKERT_CLS[k]}" style="width:${width}%">${width >= 12 ? count : ''}</span>`
    })
    .join('')
  const meta = LIKERT_KEYS
    .filter((k) => (dist?.[k] || 0) > 0)
    .map((k) => `<span class="pdf-likert-meta ${LIKERT_CLS[k]}">${esc(tr(LIKERT_LABEL_KEYS[k], LIKERT_LABELS[k]))} ${dist[k]} (${pct(dist[k], total)}%)</span>`)
    .join('')
  return `<div class="pdf-likert-bar">${segs}</div><div class="pdf-likert-meta-row">${meta}</div>`
}

function statementBlock(s, voteType, tr) {
  const likert = voteType === 'likert' && s.distribution
  const chart = likert ? likertBar(s.distribution, s.responded, tr) : divergingBar(s.agree, s.disagree, tr)
  return `<li><p>${esc(s.text)}</p>${chart}</li>`
}

const LOGO_SVG = `<svg viewBox="0 0 64 64" width="26" height="26" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="36" r="18" fill="#C4A35A"/>
  <circle cx="20" cy="20" r="9" fill="#A8843F"/>
  <circle cx="44" cy="20" r="9" fill="#A8843F"/>
  <circle cx="26" cy="34" r="3" fill="#1a1630"/>
  <circle cx="38" cy="34" r="3" fill="#1a1630"/>
  <ellipse cx="32" cy="42" rx="5" ry="3.5" fill="#8B6A32"/>
</svg>`

export function buildPrintableHTML(ctx) {
  const { topic, sessionId, cluster, voteType = 'binary', lang = 'en' } = ctx
  const tr = makeTr(ctx.t)
  const likert = voteType === 'likert'
  const cgHistory = getCommonGroundHistory(ctx)
  const groups = groupRows(cluster, voteType)
  const consensus = statementResults(cluster?.consensus, voteType)
  const divisive = statementResults(cluster?.divisive, voteType)

  const metaBits = []
  if (cluster?.voterCount != null) {
    metaBits.push(tr('export.participants', '{{count}} participants', { count: cluster.voterCount }))
    if (cluster.k != null) {
      metaBits.push(tr('export.opinionGroups', '{{count}} opinion groups', { count: cluster.k }))
    }
    if (likert) metaBits.push(tr('export.likertScale', 'Likert scale'))
  }

  const sections = []

  cgHistory.forEach((item, index) => {
    const cg = commonGroundBlock(item)
    if (!cg) return
    let voteHtml = `<p class="pdf-muted">${esc(tr('results.noVotesYet', 'No votes yet'))}</p>`
    if (cg.vote) {
      voteHtml = `<div class="pdf-bar"><span class="pdf-bar-a" style="width:${cg.vote.agreePct}%"></span><span class="pdf-bar-d" style="width:${cg.vote.disagreePct}%"></span></div>
        <div class="pdf-bar-meta"><span class="a">${esc(tr('export.agreePct', '{{count}} agree ({{pct}}%)', { count: cg.vote.agree, pct: cg.vote.agreePct }))}</span><span class="d">${esc(tr('export.disagreePct', '{{count}} disagree ({{pct}}%)', { count: cg.vote.disagree, pct: cg.vote.disagreePct }))}</span></div>`
    }
    const metaLine = [
      cg.generatedAt ? formatDate(cg.generatedAt, lang) : null,
      cg.generatedByName ? tr('export.by', 'by {{name}}', { name: esc(cg.generatedByName) }) : null,
      tr(`cgDepth.${cg.depth}.label`, cg.depth),
    ].filter(Boolean).join(' · ')
    sections.push(`<section class="pdf-section pdf-cg">
      <h2><span class="pdf-kicker">${esc(tr('export.aiCommonGround', 'AI Common Ground v{{n}}', { n: index + 1 }))}</span></h2>
      ${metaLine ? `<p class="pdf-muted">${metaLine}</p>` : ''}
      <p class="pdf-cg-statement">${esc(cg.statement)}</p>
      ${(cg.sharedGround.length || cg.openTensions.length) ? `<table class="pdf-cg-table"><thead><tr><th class="a">${esc(tr('cg.sharedGround', 'Shared ground'))}</th><th class="d">${esc(tr('cg.openTensions', 'Open tensions'))}</th></tr></thead><tbody>${Array.from({ length: Math.max(cg.sharedGround.length, cg.openTensions.length) }).map((_, i) => `<tr><td>${esc(cg.sharedGround[i] || '—')}</td><td>${esc(cg.openTensions[i] || '—')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${cg.bridgingProposal ? `<div class="pdf-bridge"><span class="pdf-bridge-label">${esc(tr('cg.bridgingProposal', 'Bridging proposal'))}</span><p>${esc(cg.bridgingProposal)}</p></div>` : ''}
      ${cg.bridgingAlternatives.length ? `<div class="pdf-stance"><span class="pdf-stance-label">${esc(tr('cg.altBridges', 'Alternative bridges'))}</span><ul>${cg.bridgingAlternatives.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
      ${cg.insights.length ? `<div class="pdf-stance"><span class="pdf-stance-label">${esc(tr('cg.insights', 'Insights'))}</span><ul>${cg.insights.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
      ${cg.tradeoffs.length ? `<div class="pdf-stance"><span class="pdf-stance-label">${esc(tr('cg.tradeoffs', 'Trade-offs'))}</span><ul>${cg.tradeoffs.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
      ${cg.groupNotes.length ? `<div class="pdf-stance"><span class="pdf-stance-label">${esc(tr('cg.groupPerspectives', 'Group perspectives'))}</span><ul>${cg.groupNotes.map((g) => `<li><strong>${esc(tr('cg.groupNote', 'Group {{group}}:', { group: g.group }))}</strong> ${esc(g.note)}</li>`).join('')}</ul></div>` : ''}
      <div class="pdf-cg-vote"><span class="pdf-vote-q">${esc(tr('export.voteQuestion', 'Do participants agree with this common ground?'))}</span>${voteHtml}</div>
    </section>`)
  })

  if (groups.length) {
    sections.push(`<section class="pdf-section">
      <h2><span class="pdf-kicker">${esc(tr('export.opinionGroupsTitle', 'Opinion Groups'))}</span></h2>
      <div class="pdf-groupbars">
        ${groups.map((g) => `<div class="pdf-groupbar">
          <span class="pdf-groupbar-name"><span class="pdf-dot g${g.group}"></span>${esc(tr('results.groupLabel', 'Group {{letter}}', { letter: g.group }))}</span>
          <span class="pdf-groupbar-track"><span class="pdf-groupbar-fill g${g.group}" style="width:${g.sharePct}%"></span></span>
          <span class="pdf-groupbar-value">${g.size} (${g.sharePct}%)</span>
        </div>`).join('')}
      </div>
      <div class="pdf-cardgrid">
        ${groups.map((g) => `<div class="pdf-card">
          <div class="pdf-card-head"><span class="pdf-badge g${g.group}">${g.group}</span><span class="pdf-card-title">${esc(tr('results.groupLabel', 'Group {{letter}}', { letter: g.group }))}<small>${esc(tr('results.person', '{{count}} people', { count: g.size }))}</small></span></div>
          ${(!g.agree.length && !g.disagree.length && !g.stronglyAgree.length && !g.stronglyDisagree.length) ? `<p class="pdf-muted">${esc(tr('results.noSharedPositions', 'No strong shared positions yet.'))}</p>` : `
            ${likert && g.stronglyAgree.length ? `<div class="pdf-stance"><span class="pdf-stance-label sa">${esc(tr('stances.stronglyAgreeOn', 'Strongly agree on'))}</span><ul>${g.stronglyAgree.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
            ${g.agree.length ? `<div class="pdf-stance"><span class="pdf-stance-label a">${esc(likert ? tr('stances.agreeOn', 'Agree on') : tr('stances.tendToAgree', 'Tend to agree'))}</span><ul>${g.agree.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
            ${likert && g.stronglyDisagree.length ? `<div class="pdf-stance"><span class="pdf-stance-label sd">${esc(tr('stances.stronglyDisagreeOn', 'Strongly disagree on'))}</span><ul>${g.stronglyDisagree.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
            ${g.disagree.length ? `<div class="pdf-stance"><span class="pdf-stance-label d">${esc(likert ? tr('stances.disagreeOn', 'Disagree on') : tr('stances.tendToDisagree', 'Tend to disagree'))}</span><ul>${g.disagree.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}`}
        </div>`).join('')}
      </div>
    </section>`)
  }

  if (consensus.length) {
    sections.push(`<section class="pdf-section">
      <h2><span class="pdf-kicker">${esc(tr('results.commonGround', 'Common Ground'))}</span><span class="pdf-sub">${esc(tr('results.whereAgree', 'Where most people agree'))}</span></h2>
      <ul class="pdf-stmts">${consensus.map((s) => statementBlock(s, voteType, tr)).join('')}</ul>
    </section>`)
  }

  if (divisive.length) {
    sections.push(`<section class="pdf-section">
      <h2><span class="pdf-kicker">${esc(tr('results.mostDivisive', 'Most Divisive'))}</span><span class="pdf-sub">${esc(tr('results.whereSplit', 'Where opinions split'))}</span></h2>
      <ul class="pdf-stmts">${divisive.map((s) => statementBlock(s, voteType, tr)).join('')}</ul>
    </section>`)
  }

  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"/>
  <title>${esc(`${APP_NAME} — ${topic || tr('export.results', 'Results')}`)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; font-size: 12px; line-height: 1.5; }
    .pdf-wrap { max-width: 760px; margin: 0 auto; padding: 24px; }
    .pdf-top { display: flex; align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 3px solid #111827; }
    .pdf-logo { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; background: #111827; }
    .pdf-brand { font-size: 16px; font-weight: 800; letter-spacing: -0.02em; }
    .pdf-brand small { display: block; font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280; }
    .pdf-date { margin-left: auto; text-align: right; font-size: 11px; font-weight: 700; color: #111827; }
    .pdf-date small { display: block; font-size: 9px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #9ca3af; }
    .pdf-title { margin: 18px 0 4px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
    .pdf-meta { color: #6b7280; font-size: 11px; font-weight: 600; }
    .pdf-meta .code { color: #111827; }
    .pdf-section { margin-top: 22px; page-break-inside: avoid; }
    h2 { display: flex; align-items: baseline; gap: 10px; margin: 0 0 10px; }
    .pdf-kicker { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; }
    .pdf-sub { font-size: 10px; font-weight: 600; color: #9ca3af; }
    .pdf-muted { color: #9ca3af; font-style: italic; }
    .pdf-cg { background: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #12b76a; border-radius: 10px; padding: 16px; }
    .pdf-cg-statement { font-size: 14px; font-weight: 700; margin: 0 0 10px; }
    .pdf-cg-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
    .pdf-cg-table th, .pdf-cg-table td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
    .pdf-cg-table th { background: #f3f4f6; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
    .pdf-cg-table th.a { color: #0a7a55; }
    .pdf-cg-table th.d { color: #b42318; }
    .pdf-bridge { padding: 8px 12px; border-left: 3px solid #12b76a; background: rgba(18,183,106,0.08); border-radius: 0 8px 8px 0; margin-top: 10px; }
    .pdf-bridge-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #0a7a55; }
    .pdf-bridge p { margin: 2px 0 0; }
    .pdf-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 10px; }
    .pdf-col-label { display: block; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
    .pdf-col-label.a, .pdf-stance-label.a { color: #0a7a55; }
    .pdf-col-label.d, .pdf-stance-label.d { color: #b42318; }
    ul { margin: 0; padding-left: 16px; }
    li { margin: 2px 0; }
    .pdf-cg-vote { margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
    .pdf-vote-q { display: block; font-size: 11px; font-weight: 700; margin-bottom: 6px; }
    .pdf-bar { display: flex; height: 12px; border-radius: 999px; overflow: hidden; background: #eceef1; }
    .pdf-bar-a { background: #2a9d4e; }
    .pdf-bar-d { background: #f04438; }
    .pdf-bar-meta { display: flex; justify-content: space-between; margin-top: 4px; font-size: 10px; font-weight: 700; }
    .pdf-bar-meta .a { color: #0a7a55; }
    .pdf-bar-meta .d { color: #b42318; }
    .pdf-groupbars { display: flex; flex-direction: column; gap: 7px; margin-bottom: 16px; }
    .pdf-groupbar { display: grid; grid-template-columns: 96px 1fr 64px; align-items: center; gap: 10px; }
    .pdf-groupbar-name { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 11px; }
    .pdf-dot { width: 9px; height: 9px; border-radius: 50%; }
    .pdf-groupbar-track { height: 9px; border-radius: 999px; background: #eceef1; overflow: hidden; }
    .pdf-groupbar-fill { display: block; height: 100%; border-radius: 999px; }
    .pdf-groupbar-value { font-size: 10px; font-weight: 600; color: #6b7280; text-align: right; }
    .gA { background: #2a9d4e; } .gB { background: #e0a400; } .gC { background: #3b82f6; } .gD { background: #a855f7; }
    .pdf-cardgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .pdf-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; page-break-inside: avoid; }
    .pdf-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .pdf-badge { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 7px; color: #fff; font-weight: 800; font-size: 12px; }
    .pdf-card-title { font-weight: 800; font-size: 12px; }
    .pdf-card-title small { display: block; font-weight: 600; font-size: 10px; color: #9ca3af; }
    .pdf-stance { margin-bottom: 6px; }
    .pdf-stance-label { display: block; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
    .pdf-stmts { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .pdf-stmts li { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; page-break-inside: avoid; }
    .pdf-stmts p { margin: 0 0 7px; font-weight: 600; }
    .pdf-likert-bar { display: flex; height: 14px; border-radius: 999px; overflow: hidden; background: #eceef1; }
    .pdf-likert-seg { display: flex; align-items: center; justify-content: center; min-width: 0; font-size: 8px; font-weight: 700; color: #fff; overflow: hidden; }
    .pdf-likert-seg.sd { background: #820018; }
    .pdf-likert-seg.d { background: #fb7185; color: #4a0010; }
    .pdf-likert-seg.n { background: #98a2b3; }
    .pdf-likert-seg.a { background: #34d399; color: #04331f; }
    .pdf-likert-seg.sa { background: #045a3c; }
    .pdf-likert-meta-row { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 4px; font-size: 9px; font-weight: 600; color: #6b7280; }
    .pdf-likert-meta.sd { color: #820018; }
    .pdf-likert-meta.d { color: #fb7185; }
    .pdf-likert-meta.n { color: #98a2b3; }
    .pdf-likert-meta.a { color: #0a7a55; }
    .pdf-likert-meta.sa { color: #045a3c; }
    .pdf-stance-label.sa { color: #045a3c; }
    .pdf-stance-label.sd { color: #820018; }
  </style></head>
  <body><div class="pdf-wrap">
    <div class="pdf-top">
      <span class="pdf-logo">${LOGO_SVG}</span>
      <span class="pdf-brand">${esc(APP_NAME)}<small>${esc(tr('export.sessionResults', 'Session Results'))}</small></span>
      <span class="pdf-date"><small>${esc(tr('export.downloaded', 'Downloaded'))}</small>${esc(formatDate(Date.now() / 1000, lang))}</span>
    </div>
    <h1 class="pdf-title">${esc(topic || tr('export.untitled', 'Untitled session'))}</h1>
    <p class="pdf-meta">${metaBits.join(' · ')}${sessionId ? `${metaBits.length ? ' · ' : ''}${esc(tr('export.session', 'Session'))} <span class="code">${esc(sessionId)}</span>` : ''}</p>
    ${sections.join('')}
  </div></body></html>`
}

export function exportPDF(ctx, filename) {
  const win = window.open('', '_blank')
  if (!win) return false
  if (filename) {
    try { win.document.title = filename.replace(/\.pdf$/i, '') } catch { /* noop */ }
  }
  win.document.open()
  win.document.write(buildPrintableHTML(ctx))
  win.document.close()
  win.focus()
  const trigger = () => {
    win.focus()
    win.print()
  }
  if (win.document.readyState === 'complete') {
    setTimeout(trigger, 250)
  } else {
    win.addEventListener('load', () => setTimeout(trigger, 250))
  }
  return true
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function exportFilename(sessionId, ext) {
  const stamp = new Date().toISOString().slice(0, 10)
  return `murmi-${sessionId || 'session'}-${stamp}.${ext}`
}

export function exportVotesFilename(sessionId, kind, ext) {
  const stamp = new Date().toISOString().slice(0, 10)
  return `murmi-${sessionId || 'session'}-${kind}-${stamp}.${ext}`
}

export function buildRawVotesCSV(ctx) {
  const { topic, sessionId, results, voteType = 'binary' } = ctx
  const tr = makeTr(ctx.t)
  const lines = []
  const row = (...cells) => lines.push(cells.map(csvCell).join(','))
  const likert = voteType === 'likert'
  const optionKeys = voteOptionKeys(voteType)

  row(`${APP_NAME} — Raw votes`)
  row('Topic', topic || 'Untitled session')
  if (sessionId) row('Session', sessionId)
  row('Vote type', likert ? 'Likert (5-point)' : 'Binary')

  const statements = results?.statements || []
  const voters = results?.voters || []
  if (!statements.length || !voters.length) {
    lines.push('')
    row('Note', 'No vote data available')
    return lines.join('\n')
  }

  const rows = aggregateVotesByStatement(statements, voters, voteType)
  lines.push('')
  row(
    'Statement ID',
    'Statement',
    ...optionKeys.map((key) => voteOptionLabel(key, voteType, tr)),
    'Total',
  )
  for (const entry of rows) {
    row(
      entry.id,
      entry.text,
      ...optionKeys.map((key) => entry.counts[key]),
      entry.total,
    )
  }

  return lines.join('\n')
}

export function buildRawVotesJSON(ctx) {
  const { topic, sessionId, results, voteType = 'binary' } = ctx
  const statements = results?.statements || []
  const voters = results?.voters || []
  const rows = aggregateVotesByStatement(statements, voters, voteType)
  const data = {
    topic: topic || null,
    session: sessionId || null,
    voteType: voteType === 'likert' ? 'likert' : 'binary',
    statements: rows.map(({ id, text, counts, total }) => ({
      id,
      text,
      votes: counts,
      total,
    })),
  }
  return JSON.stringify(data, null, 2)
}
