import { CG_DEPTH_LABELS } from '../../constants/common-ground-depth'

export default function CommonGroundHotbar({
  depth = 'basic',
  versionNum = 1,
  generatedByName = null,
  onView,
  onDismiss,
}) {
  const depthLabel = CG_DEPTH_LABELS[depth] || depth

  return (
    <div className="cg-hotbar" role="status" data-testid="cg-hotbar">
      <div className="cg-hotbar-body">
        <span className="cg-hotbar-icon" aria-hidden="true">✦</span>
        <div className="cg-hotbar-copy">
          <strong className="cg-hotbar-title">New AI common ground ready</strong>
          <span className="cg-hotbar-meta">
            {depthLabel}
            {versionNum > 1 && ` · v${versionNum}`}
            {generatedByName && ` · by ${generatedByName}`}
          </span>
        </div>
      </div>
      <div className="cg-hotbar-actions">
        <button
          type="button"
          className="cg-hotbar-view"
          data-testid="cg-hotbar-view"
          onClick={onView}
        >
          View in Results
        </button>
        <button
          type="button"
          className="cg-hotbar-dismiss"
          data-testid="cg-hotbar-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
    </div>
  )
}
