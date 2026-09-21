import { useEffect, useMemo, useState } from 'react'
import { densityImage, mapPosition, layoutOpinionDots, layoutThemeLabels, MAX_VISIBLE_THEMES } from './map-layout'
import { GROUP_COLORS, groupStyle } from './group-colors'
export { GROUP_COLORS } from './group-colors'

export default function OpinionMap({ groups, points, copy, onSelectGroup }) {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 480px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 480px)')
    const update = () => setCompact(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const [zoom, setZoom] = useState(1)
  const [focusYou, setFocusYou] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const overflow = groups.length > MAX_VISIBLE_THEMES
  const dots = useMemo(() => layoutOpinionDots(points || [], true), [points])
  const textures = useMemo(() => {
    const peak = groups.reduce((max, group) => Math.max(max, ...(group.density?.values || [0])), 0)
    return groups.map(group => densityImage(group.density, GROUP_COLORS[group.id % GROUP_COLORS.length], peak))
  }, [groups])
  const labels = useMemo(() => layoutThemeLabels(groups, points || [], copy.themeEmerging, compact, selectedGroup), [groups, points, copy.themeEmerging, compact, selectedGroup])
  const you = dots.find((point) => point.isYou)
  const centre = focusYou ? you : null
  const size = 600 / zoom
  const viewX = Math.max(0, Math.min(600 - size, (centre?.plotX ?? 300) - size / 2))
  const viewY = Math.max(0, Math.min(600 - size, (centre?.plotY ?? 300) - size / 2))
  const dimmed = (group) => selectedGroup !== null && selectedGroup !== group
  const selectGroup = (groupId) => { setSelectedGroup(groupId); onSelectGroup?.(groupId) }
  return <figure className="opinion-map">
    <div className="opinion-map-heading">
      <div><strong>{points ? copy.everyDot : copy.title}</strong>{!points && <p>{copy.publicMap}</p>}</div>
      {you && <button type="button" className="opinion-find-me" onClick={() => {setFocusYou(true); setSelectedGroup(you.cluster); setZoom(1.5)}}>{copy.findMe}</button>}
    </div>
    <div className="opinion-map-stage">
      <svg viewBox={`${viewX} ${viewY} ${size} ${size}`} role="group" aria-label={copy.title}
        onClick={(event) => { if (event.target === event.currentTarget) {setFocusYou(false); setSelectedGroup(null)} }}>
        <g className="opinion-map-grid" aria-hidden="true">
          {[100, 200, 300, 400, 500].map((value) => <g key={value}>
            <line x1="25" y1={value} x2="575" y2={value} />
            <line x1={value} y1="25" x2={value} y2="575" />
          </g>)}
        </g>
        {groups.map((group, index) => <g key={group.id} data-group={group.letter} className="opinion-cloud" opacity={dimmed(group.id) ? .18 : 1}>
          {textures[index] && <image href={textures[index]} x="35" y="35" width="530" height="530" />}
        </g>)}
        {dots.map((point) => {
          const color = GROUP_COLORS[point.cluster % GROUP_COLORS.length]
          return <g key={point.key} className="opinion-dot" data-dot-key={point.key} data-you={point.isYou || undefined}
            opacity={dimmed(point.cluster) && !point.isYou ? .2 : 1} aria-hidden="true">
            {point.isYou && <circle className="opinion-dot-ring" cx={point.plotX} cy={point.plotY} r="18"
              fill="none" stroke={color} strokeWidth="1.5" />}
            <circle className="opinion-dot-core" cx={point.plotX} cy={point.plotY} r={point.isYou ? 10 : 7.5}
              fill={color} strokeWidth="1.8" />
            {point.isYou && <text x={point.plotX} y={point.plotY - 26} className="opinion-you-label">{copy.you}</text>}
          </g>
        })}
        {overflow && groups.filter(group => group.id !== selectedGroup).map(group => <g
          key={group.id} className="opinion-theme-label opinion-group-color" style={groupStyle(group.id)} role="button" tabIndex="0"
          aria-label={`${copy.group} ${group.letter}: ${group.theme?.title || copy.themeEmerging}. ${copy.viewEvidence}`}
          onClick={() => selectGroup(group.id)}
          onKeyDown={event => {if(event.key === 'Enter' || event.key === ' ') {event.preventDefault(); selectGroup(group.id)}}}>
          <rect x={mapPosition(group.position.x) - 18} y={mapPosition(group.position.y) - 18} width="36" height="36" rx="8" fill="transparent" />
          <text x={mapPosition(group.position.x)} y={mapPosition(group.position.y) + 6} className="opinion-group-letter">{group.letter}</text>
        </g>)}
        {labels.map(({group, x, y, anchorX, anchorY, height, halfWidth, lineHeight, lines}) => <g
          key={group.id} className="opinion-theme-label opinion-group-color" style={groupStyle(group.id)} role="button" tabIndex="0"
          aria-label={`${copy.group} ${group.letter}: ${group.theme?.title || copy.themeEmerging}. ${copy.viewEvidence}`}
          opacity={dimmed(group.id) ? .3 : 1}
          onClick={() => {selectGroup(group.id)}}
          onKeyDown={event => {if(event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();selectGroup(group.id)
          }}}>
          <title>{group.theme?.description || copy.themeEmerging}</title>
          {Math.hypot(x-anchorX,y-anchorY)>35 && <line x1={anchorX} y1={anchorY} x2={x} y2={y}
            stroke={GROUP_COLORS[group.id % GROUP_COLORS.length]} strokeWidth="1" opacity=".65" />}
          <rect x={x-halfWidth} y={y-height/2-5} width={halfWidth*2} height={height+10} rx="8" fill="transparent" />
          <text x={x} y={y-height/2+(compact ? 21 : 15)}>
            <tspan className="opinion-theme-count" x={x}>{group.letter} · {group.size} {copy.people}</tspan>
            {lines.map((line, index)=><tspan x={x} dy={lineHeight} key={index}>{line}</tspan>)}
          </text>
        </g>)}
      </svg>
      <div className="opinion-map-zoom" aria-label={copy.zoom}>
        <button type="button" aria-label={copy.zoomOut} disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - .5))}>−</button>
        <button type="button" aria-label={copy.resetMap} onClick={() => {setZoom(1);setFocusYou(false);setSelectedGroup(null)}}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label={copy.zoomIn} disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + .5))}>+</button>
      </div>
    </div>
    {overflow && <p className="opinion-overflow-note">{copy.overflowNote}</p>}
  </figure>
}
