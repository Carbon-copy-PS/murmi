const GROUP_LETTERS = ['A', 'B', 'C', 'D']

function pct(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0
}

function groupRows(cluster) {
  if (!cluster?.groups?.length) return []
  return cluster.groups.map((g) => ({
    group: GROUP_LETTERS[g.id],
    size: g.size,
    sharePct: pct(g.size, cluster.voterCount),
    agree: (g.agree || []).map((s) => s.text),
    disagree: (g.disagree || []).map((s) => s.text),
  }))
}

function statementResults(list) {
  return (list || []).map((s) => ({
    text: s.text,
    agree: s.agree || 0,
    disagree: s.disagree || 0,
  }))
}

function commonGroundBlock(commonGround) {
  if (!commonGround?.groupStatement) return null
  const v = commonGround.votes
  const total = v ? (v.agree || 0) + (v.disagree || 0) : 0
  const agreePct = total ? pct(v.agree, total) : 0
  return {
    statement: commonGround.groupStatement,
    bridgingProposal: (commonGround.bridgingProposal || '').trim(),
    sharedGround: (commonGround.commonGround || []).filter(Boolean),
    openTensions: (commonGround.divides || []).filter(Boolean),
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
  const { topic, sessionId, cluster, commonGround } = ctx
  const lines = []
  const row = (...cells) => lines.push(cells.map(csvCell).join(','))

  row('Debate Sense — Results')
  row('Topic', topic || 'Untitled session')
  if (sessionId) row('Session', sessionId)
  if (cluster?.voterCount != null) row('Participants', cluster.voterCount)
  if (cluster?.k != null) row('Opinion groups', cluster.k)

  const cg = commonGroundBlock(commonGround)
  if (cg) {
    lines.push('')
    row('AI common ground')
    row('Field', 'Value')
    row('Statement', cg.statement)
    if (cg.bridgingProposal) row('Bridging proposal', cg.bridgingProposal)
    cg.sharedGround.forEach((t) => row('Shared ground', t))
    cg.openTensions.forEach((t) => row('Open tension', t))
    if (cg.vote) {
      row('Agree votes', `${cg.vote.agree} (${cg.vote.agreePct}%)`)
      row('Disagree votes', `${cg.vote.disagree} (${cg.vote.disagreePct}%)`)
    } else {
      row('Votes', 'No votes yet')
    }
  }

  const groups = groupRows(cluster)
  if (groups.length) {
    lines.push('')
    row('Opinion groups')
    row('Group', 'Size', 'Share %')
    groups.forEach((g) => row(g.group, g.size, g.sharePct))

    lines.push('')
    row('Group positions')
    row('Group', 'Stance', 'Statement')
    groups.forEach((g) => {
      g.agree.forEach((t) => row(g.group, 'Tend to agree', t))
      g.disagree.forEach((t) => row(g.group, 'Tend to disagree', t))
    })
  }

  const consensus = statementResults(cluster?.consensus)
  const divisive = statementResults(cluster?.divisive)
  if (consensus.length || divisive.length) {
    lines.push('')
    row('Statement results')
    row('Category', 'Statement', 'Agree', 'Disagree')
    consensus.forEach((s) => row('Common ground', s.text, s.agree, s.disagree))
    divisive.forEach((s) => row('Most divisive', s.text, s.agree, s.disagree))
  }

  return lines.join('\n')
}

export function buildJSON(ctx) {
  const { topic, sessionId, cluster, commonGround } = ctx
  const data = {
    topic: topic || null,
    session: sessionId || null,
    participants: cluster?.voterCount ?? null,
    opinionGroups: cluster?.k ?? null,
  }

  const cg = commonGroundBlock(commonGround)
  if (cg) {
    data.aiCommonGround = { statement: cg.statement }
    if (cg.bridgingProposal) data.aiCommonGround.bridgingProposal = cg.bridgingProposal
    if (cg.sharedGround.length) data.aiCommonGround.sharedGround = cg.sharedGround
    if (cg.openTensions.length) data.aiCommonGround.openTensions = cg.openTensions
    if (cg.vote) data.aiCommonGround.vote = cg.vote
  }

  const groups = groupRows(cluster)
  if (groups.length) {
    data.opinionGroupBreakdown = groups.map((g) => ({
      group: g.group,
      size: g.size,
      share: `${g.sharePct}%`,
      tendToAgree: g.agree,
      tendToDisagree: g.disagree,
    }))
  }

  const consensus = statementResults(cluster?.consensus)
  if (consensus.length) data.commonGround = consensus

  const divisive = statementResults(cluster?.divisive)
  if (divisive.length) data.mostDivisive = divisive

  return JSON.stringify(data, null, 2)
}

export function buildSummary(ctx) {
  const { topic, sessionId, cluster, commonGround } = ctx
  const out = []

  out.push('DEBATE SENSE — RESULTS')
  out.push('======================')
  out.push('')
  out.push(`Topic: ${topic || 'Untitled session'}`)
  if (sessionId) out.push(`Session: ${sessionId}`)
  if (cluster?.voterCount != null) {
    out.push(`${cluster.voterCount} participant${cluster.voterCount === 1 ? '' : 's'} · ${cluster.k} opinion group${cluster.k === 1 ? '' : 's'}`)
  }

  const cg = commonGroundBlock(commonGround)
  if (cg) {
    out.push('', 'AI COMMON GROUND', '----------------', cg.statement)
    if (cg.bridgingProposal) out.push('', `Bridging proposal: ${cg.bridgingProposal}`)
    if (cg.sharedGround.length) {
      out.push('', 'Shared ground:')
      cg.sharedGround.forEach((t) => out.push(`  • ${t}`))
    }
    if (cg.openTensions.length) {
      out.push('', 'Open tensions:')
      cg.openTensions.forEach((t) => out.push(`  • ${t}`))
    }
    out.push('', cg.vote
      ? `Vote: ${cg.vote.agree} agree (${cg.vote.agreePct}%) · ${cg.vote.disagree} disagree (${cg.vote.disagreePct}%)`
      : 'Vote: no votes yet')
  }

  const groups = groupRows(cluster)
  if (groups.length) {
    out.push('', 'OPINION GROUPS', '--------------')
    groups.forEach((g) => {
      out.push(`Group ${g.group} — ${g.size} ${g.size === 1 ? 'person' : 'people'} (${g.sharePct}%)`)
      if (!g.agree.length && !g.disagree.length) {
        out.push('  No strong shared positions yet.')
      } else {
        if (g.agree.length) {
          out.push('  Tend to agree:')
          g.agree.forEach((t) => out.push(`    • ${t}`))
        }
        if (g.disagree.length) {
          out.push('  Tend to disagree:')
          g.disagree.forEach((t) => out.push(`    • ${t}`))
        }
      }
      out.push('')
    })
  }

  const consensus = statementResults(cluster?.consensus)
  if (consensus.length) {
    out.push('COMMON GROUND', '-------------')
    consensus.forEach((s) => out.push(`  • ${s.text} — ${s.agree} agree / ${s.disagree} disagree`))
    out.push('')
  }

  const divisive = statementResults(cluster?.divisive)
  if (divisive.length) {
    out.push('MOST DIVISIVE', '-------------')
    divisive.forEach((s) => out.push(`  • ${s.text} — ${s.agree} agree / ${s.disagree} disagree`))
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

function divergingBar(agree, disagree) {
  const total = agree + disagree || 1
  const a = Math.round((agree / total) * 100)
  const d = 100 - a
  return `<div class="pdf-bar"><span class="pdf-bar-a" style="width:${a}%"></span><span class="pdf-bar-d" style="width:${d}%"></span></div>
    <div class="pdf-bar-meta"><span class="a">${agree} agree</span><span class="d">${disagree} disagree</span></div>`
}

const LOGO_SVG = `<svg viewBox="0 0 512 512" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke-linecap="round">
    <g stroke="#12b76a"><path d="M201 351.26 A 110 110 0 0 1 201 160.74" stroke-width="30"/><path d="M173.5 398.9 A 165 165 0 0 1 173.5 113.1" stroke-width="30" stroke-opacity="0.5"/></g>
    <g stroke="#f04438"><path d="M311 160.74 A 110 110 0 0 1 311 351.26" stroke-width="30"/><path d="M338.5 113.1 A 165 165 0 0 1 338.5 398.9" stroke-width="30" stroke-opacity="0.5"/></g>
  </g>
  <circle cx="256" cy="256" r="46" fill="#fff"/>
</svg>`

export function buildPrintableHTML(ctx) {
  const { topic, sessionId, cluster, commonGround } = ctx
  const cg = commonGroundBlock(commonGround)
  const groups = groupRows(cluster)
  const consensus = statementResults(cluster?.consensus)
  const divisive = statementResults(cluster?.divisive)

  const metaBits = []
  if (cluster?.voterCount != null) {
    metaBits.push(`${cluster.voterCount} participant${cluster.voterCount === 1 ? '' : 's'}`)
    metaBits.push(`${cluster.k} opinion group${cluster.k === 1 ? '' : 's'}`)
  }

  const sections = []

  if (cg) {
    let voteHtml = '<p class="pdf-muted">No votes yet.</p>'
    if (cg.vote) {
      voteHtml = `<div class="pdf-bar"><span class="pdf-bar-a" style="width:${cg.vote.agreePct}%"></span><span class="pdf-bar-d" style="width:${cg.vote.disagreePct}%"></span></div>
        <div class="pdf-bar-meta"><span class="a">${cg.vote.agree} agree (${cg.vote.agreePct}%)</span><span class="d">${cg.vote.disagree} disagree (${cg.vote.disagreePct}%)</span></div>`
    }
    sections.push(`<section class="pdf-section pdf-cg">
      <h2><span class="pdf-kicker">AI Common Ground</span></h2>
      <p class="pdf-cg-statement">${esc(cg.statement)}</p>
      ${cg.bridgingProposal ? `<div class="pdf-bridge"><span class="pdf-bridge-label">Bridging proposal</span><p>${esc(cg.bridgingProposal)}</p></div>` : ''}
      ${(cg.sharedGround.length || cg.openTensions.length) ? `<div class="pdf-cols">
        ${cg.sharedGround.length ? `<div><span class="pdf-col-label a">Shared ground</span><ul>${cg.sharedGround.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
        ${cg.openTensions.length ? `<div><span class="pdf-col-label d">Open tensions</span><ul>${cg.openTensions.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
      </div>` : ''}
      <div class="pdf-cg-vote"><span class="pdf-vote-q">Do participants agree with this common ground?</span>${voteHtml}</div>
    </section>`)
  }

  if (groups.length) {
    sections.push(`<section class="pdf-section">
      <h2><span class="pdf-kicker">Opinion Groups</span></h2>
      <div class="pdf-groupbars">
        ${groups.map((g) => `<div class="pdf-groupbar">
          <span class="pdf-groupbar-name"><span class="pdf-dot g${g.group}"></span>Group ${g.group}</span>
          <span class="pdf-groupbar-track"><span class="pdf-groupbar-fill g${g.group}" style="width:${g.sharePct}%"></span></span>
          <span class="pdf-groupbar-value">${g.size} (${g.sharePct}%)</span>
        </div>`).join('')}
      </div>
      <div class="pdf-cardgrid">
        ${groups.map((g) => `<div class="pdf-card">
          <div class="pdf-card-head"><span class="pdf-badge g${g.group}">${g.group}</span><span class="pdf-card-title">Group ${g.group}<small>${g.size} ${g.size === 1 ? 'person' : 'people'}</small></span></div>
          ${(!g.agree.length && !g.disagree.length) ? '<p class="pdf-muted">No strong shared positions yet.</p>' : `
            ${g.agree.length ? `<div class="pdf-stance"><span class="pdf-stance-label a">Tend to agree</span><ul>${g.agree.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
            ${g.disagree.length ? `<div class="pdf-stance"><span class="pdf-stance-label d">Tend to disagree</span><ul>${g.disagree.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}`}
        </div>`).join('')}
      </div>
    </section>`)
  }

  if (consensus.length) {
    sections.push(`<section class="pdf-section">
      <h2><span class="pdf-kicker">Common Ground</span><span class="pdf-sub">Where most people agree</span></h2>
      <ul class="pdf-stmts">${consensus.map((s) => `<li><p>${esc(s.text)}</p>${divergingBar(s.agree, s.disagree)}</li>`).join('')}</ul>
    </section>`)
  }

  if (divisive.length) {
    sections.push(`<section class="pdf-section">
      <h2><span class="pdf-kicker">Most Divisive</span><span class="pdf-sub">Where opinions split</span></h2>
      <ul class="pdf-stmts">${divisive.map((s) => `<li><p>${esc(s.text)}</p>${divergingBar(s.agree, s.disagree)}</li>`).join('')}</ul>
    </section>`)
  }

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
  <title>${esc(`Debate Sense — ${topic || 'Results'}`)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; font-size: 12px; line-height: 1.5; }
    .pdf-wrap { max-width: 760px; margin: 0 auto; padding: 24px; }
    .pdf-top { display: flex; align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 3px solid #111827; }
    .pdf-logo { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; background: #111827; }
    .pdf-brand { font-size: 16px; font-weight: 800; letter-spacing: -0.02em; }
    .pdf-brand small { display: block; font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280; }
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
    .pdf-bridge { padding: 8px 12px; border-left: 3px solid #12b76a; background: rgba(18,183,106,0.08); border-radius: 0 8px 8px 0; margin-bottom: 10px; }
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
  </style></head>
  <body><div class="pdf-wrap">
    <div class="pdf-top">
      <span class="pdf-logo">${LOGO_SVG}</span>
      <span class="pdf-brand">Debate Sense<small>Debate Results</small></span>
    </div>
    <h1 class="pdf-title">${esc(topic || 'Untitled session')}</h1>
    <p class="pdf-meta">${metaBits.join(' · ')}${sessionId ? `${metaBits.length ? ' · ' : ''}Session <span class="code">${esc(sessionId)}</span>` : ''}</p>
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
  return `debate-sense-${sessionId || 'session'}-${stamp}.${ext}`
}
