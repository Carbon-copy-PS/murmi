const GROUP_LETTERS = ['A', 'B', 'C', 'D']

function countsByStatement(results) {
  const map = {}
  if (!results?.voters) return map
  for (const voter of results.voters) {
    for (const [sid, vote] of Object.entries(voter.votes || {})) {
      const c = map[sid] || (map[sid] = { agree: 0, disagree: 0, pass: 0 })
      if (vote === 'agree') c.agree += 1
      else if (vote === 'disagree') c.disagree += 1
      else if (vote === 'neutral') c.pass += 1
    }
  }
  return map
}

function statementRows({ statements, results }) {
  const counts = countsByStatement(results)
  const approved = statements.filter((s) => s.approved)
  return approved.map((s) => {
    const c = counts[s.id] || { agree: s.agrees || 0, disagree: s.disagrees || 0, pass: 0 }
    const total = c.agree + c.disagree + c.pass
    return {
      id: s.id,
      text: s.text,
      custom: Boolean(s.custom),
      agree: c.agree,
      disagree: c.disagree,
      pass: c.pass,
      total,
      agreePct: total ? Math.round((c.agree / total) * 100) : 0,
    }
  })
}

function csvCell(value) {
  const str = String(value ?? '')
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function buildCSV(ctx) {
  const rows = statementRows(ctx)
  const header = ['statement_id', 'statement', 'custom', 'agree', 'disagree', 'pass', 'total', 'agree_pct']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push([r.id, r.text, r.custom, r.agree, r.disagree, r.pass, r.total, r.agreePct].map(csvCell).join(','))
  }
  return lines.join('\n')
}

export function buildJSON(ctx) {
  const { topic, sessionId, results, cluster } = ctx
  return JSON.stringify(
    {
      meta: {
        app: 'Debate Sense',
        sessionId: sessionId || null,
        topic: topic || null,
        exportedAt: new Date().toISOString(),
        voterCount: cluster?.voterCount ?? null,
        groupCount: cluster?.k ?? null,
      },
      statements: statementRows(ctx),
      voters: (results?.voters || []).map((v) => ({ key: v.key, votes: v.votes })),
      groups: (cluster?.groups || []).map((g) => ({
        group: GROUP_LETTERS[g.id],
        size: g.size,
        tendsToAgree: g.agree.map((s) => s.text),
        tendsToDisagree: g.disagree.map((s) => s.text),
      })),
      consensus: (cluster?.consensus || []).map((s) => ({ text: s.text, agree: s.agree, disagree: s.disagree })),
      divisive: (cluster?.divisive || []).map((s) => ({ text: s.text, agree: s.agree, disagree: s.disagree })),
      aiCommonGround: ctx.commonGround || null,
    },
    null,
    2,
  )
}

export function buildSummary(ctx) {
  const { topic, sessionId, cluster, commonGround } = ctx
  const rows = statementRows(ctx)
  const out = []
  out.push(`Debate Sense — ${topic || 'Untitled session'}${sessionId ? ` (${sessionId})` : ''}`)
  if (cluster?.voterCount != null) {
    out.push(`${cluster.voterCount} participants · ${rows.length} statements · ${cluster.k} opinion group${cluster.k === 1 ? '' : 's'}`)
  }
  out.push(`Exported ${new Date().toLocaleString()}`)

  if (cluster?.consensus?.length) {
    out.push('', 'COMMON GROUND')
    cluster.consensus.forEach((s) => out.push(`  • ${s.text} (${s.agree} agree / ${s.disagree} disagree)`))
  }
  if (cluster?.divisive?.length) {
    out.push('', 'MOST DIVISIVE')
    cluster.divisive.forEach((s) => out.push(`  • ${s.text} (${s.agree} agree / ${s.disagree} disagree)`))
  }
  if (cluster?.groups?.length) {
    out.push('', 'OPINION GROUPS')
    cluster.groups.forEach((g) => {
      out.push(`  Group ${GROUP_LETTERS[g.id]} — ${g.size} ${g.size === 1 ? 'person' : 'people'}`)
      if (g.agree.length) out.push(`    agree: ${g.agree.map((s) => s.text).join('; ')}`)
      if (g.disagree.length) out.push(`    disagree: ${g.disagree.map((s) => s.text).join('; ')}`)
    })
  }
  if (commonGround?.groupStatement) {
    out.push('', 'AI COMMON GROUND', `  ${commonGround.groupStatement}`)
  }

  out.push('', 'ALL STATEMENTS')
  rows.forEach((r) => out.push(`  • ${r.text} — ${r.agree}/${r.disagree}/${r.pass} (agree/disagree/pass)`))

  return out.join('\n')
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
  return `debate-sense-${sessionId || 'session'}-${stamp}.${ext}`
}
