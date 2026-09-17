import { useMemo, useState } from 'react'
import { densityImage, mapPosition, layoutOpinionDots } from './map-layout'

export const GROUP_COLORS = ['#26956c', '#c29521', '#547bd8', '#a568ba']

export default function OpinionMap({ groups, points, copy }) {
  const [separate, setSeparate] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [selected, setSelected] = useState(null)
  const [hovered, setHovered] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const dots = useMemo(() => layoutOpinionDots(points || [], separate), [points, separate])
  const textures = useMemo(() => {
    const peak = groups.reduce((max, group) => Math.max(max, ...(group.density?.values || [0])), 0)
    return groups.map(group => densityImage(group.density, GROUP_COLORS[group.id % 4], peak))
  }, [groups])
  const stacks = separate ? [] : dots.filter((point, index) => point.overlapping > 1 &&
    dots.findIndex(other => Math.round(other.plotX) === Math.round(point.plotX) && Math.round(other.plotY) === Math.round(point.plotY)) === index)
  const active = dots.find((point) => point.key === (hovered || selected))
  const you = dots.find((point) => point.isYou)
  const centre = dots.find((point) => point.key === selected)
  const size = 600 / zoom
  const viewX = Math.max(0, Math.min(600 - size, (centre?.plotX ?? 300) - size / 2))
  const viewY = Math.max(0, Math.min(600 - size, (centre?.plotY ?? 300) - size / 2))
  const dimmed = (group) => selectedGroup !== null && selectedGroup !== group
  const focusDot = (point) => { setSelected(point.key); setSelectedGroup(point.cluster) }
  return <figure className="opinion-map">
    <div className="opinion-map-heading">
      <div><strong>{points ? copy.everyDot : copy.title}</strong><p>{points ? copy.mapInvite : copy.publicMap}</p></div>
      {you && <button type="button" className="opinion-find-me" onClick={() => {focusDot(you); setZoom(1.5)}}>{copy.findMe}</button>}
    </div>
    <div className="opinion-map-stage">
      <svg viewBox={`${viewX} ${viewY} ${size} ${size}`} role="group" aria-label={copy.title}
        onClick={(event) => { if (event.target === event.currentTarget) {setSelected(null); setSelectedGroup(null)} }}>
        <g className="opinion-map-grid" aria-hidden="true">
          {[100, 200, 300, 400, 500].map((value) => <g key={value}>
            <line x1="25" y1={value} x2="575" y2={value} />
            <line x1={value} y1="25" x2={value} y2="575" />
          </g>)}
        </g>
        {groups.map((group, index) => <g key={group.id} data-group={group.letter} className="opinion-cloud" opacity={dimmed(group.id) ? .18 : 1}>
          {textures[index] && <image href={textures[index]} x="35" y="35" width="530" height="530" />}
          {!points && <text x={mapPosition(group.position.x)} y={mapPosition(group.position.y) + 5} className="opinion-group-letter">{group.letter}</text>}
        </g>)}
        {dots.map((point, index) => {
          const isActive = active?.key === point.key || selected === point.key
          const color = GROUP_COLORS[point.cluster % 4]
          const label = `${point.isYou ? copy.you : `${copy.participant} ${index + 1}`} · ${copy.group} ${String.fromCharCode(65 + point.cluster)} · ${point.answered || 0} ${copy.responses}`
          return <g key={point.key} className="opinion-dot" data-dot-key={point.key} data-you={point.isYou || undefined}
            opacity={dimmed(point.cluster) && !point.isYou ? .2 : 1}
            role="button" tabIndex="0" aria-label={label} aria-pressed={selected === point.key}
            onMouseEnter={() => setHovered(point.key)} onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(point.key)} onBlur={() => setHovered(null)}
            onClick={() => focusDot(point)} onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); focusDot(point)}
              if (event.key === 'Escape') {setSelected(null); setSelectedGroup(null); setHovered(null)}
            }}>
            <title>{label}</title>
            {(point.isYou || isActive) && <circle className="opinion-dot-ring" cx={point.plotX} cy={point.plotY} r={point.isYou ? 11 : 9}
              fill="none" stroke={color} strokeWidth="1.5" />}
            <circle className="opinion-dot-hit" cx={point.plotX} cy={point.plotY} r="10" fill="transparent" />
            <circle className="opinion-dot-core" cx={point.plotX} cy={point.plotY} r={point.isYou || isActive ? 5.5 : 4}
              fill={color} stroke="white" strokeWidth="1.3" />
            {point.isYou && <text x={point.plotX} y={point.plotY - 17} className="opinion-you-label">{copy.you}</text>}
          </g>
        })}
        {stacks.map(point => <text key={point.key} x={point.plotX + 12} y={point.plotY - 10}
          className="opinion-stack-count" aria-hidden="true">{point.overlapping}</text>)}
      </svg>
      <div className="opinion-map-zoom" aria-label={copy.zoom}>
        <button type="button" aria-label={copy.zoomOut} disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - .5))}>−</button>
        <button type="button" aria-label={copy.resetMap} onClick={() => {setZoom(1);setSelected(null);setSelectedGroup(null)}}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label={copy.zoomIn} disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + .5))}>+</button>
      </div>
    </div>
    <div className="opinion-map-legend" aria-label={copy.title}>
      {groups.map((group) => <button key={group.id} type="button" aria-pressed={selectedGroup === group.id}
        onClick={() => {setSelectedGroup(selectedGroup === group.id ? null : group.id); setSelected(null)}}>
        <i style={{background:GROUP_COLORS[group.id % 4]}} />{copy.group} {group.letter}<strong>{group.size}</strong><span>{copy.people}</span>
      </button>)}
    </div>
    {points && <div className="opinion-map-detail" aria-live="polite">
      {active ? <><strong>{active.isYou ? copy.you : `${copy.participant} ${dots.indexOf(active) + 1}`}</strong>
        <span>{copy.group} {String.fromCharCode(65 + active.cluster)} · {active.answered || 0} {copy.responses}</span>
        {active.overlapping > 1 && <span>{copy.samePosition}: {active.overlapping}</span>}</> : <span>{copy.mapInvite}</span>}
    </div>}
    <figcaption>
      <p>{copy.cloudNote}</p>
      {points && !separate && <small>{copy.exactNote}</small>}
      {points && <label className="opinion-map-spread-toggle"><input type="checkbox" checked={separate} onChange={(event) => setSeparate(event.target.checked)} />{copy.separateDots}</label>}
      {points && separate && <small>{copy.offsetNote}</small>}
    </figcaption>
  </figure>
}
