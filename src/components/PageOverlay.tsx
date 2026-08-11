import { OUTLINE_COLOR } from '../core/config/constants'
import type { PageFormat } from '../config/formats'
import { HANDLES, handlePoint } from '../render/hitTest'
import type { EditorOverlay } from '../hooks/useCanvasEditor'

/**
 * Selection and drag feedback, drawn as an SVG *over* the canvas in page
 * coordinates — never into it, so exports stay clean.
 */
export function PageOverlay({
  format,
  overlay,
}: {
  format: PageFormat
  overlay: EditorOverlay
}) {
  const px = (n: number) => format.w * n
  const handleSize = px(0.008)

  return (
    <svg
      viewBox={`0 0 ${format.w} ${format.h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {overlay.showGrid && (
        <g stroke="rgba(0,0,0,0.18)" strokeWidth={px(0.0012)}>
          {Array.from({ length: format.cols - 1 }, (_, i) => (
            <line
              key={`c${i}`}
              x1={((i + 1) * format.w) / format.cols}
              y1={0}
              x2={((i + 1) * format.w) / format.cols}
              y2={format.h}
            />
          ))}
          {Array.from({ length: format.rows - 1 }, (_, i) => (
            <line
              key={`r${i}`}
              x1={0}
              y1={((i + 1) * format.h) / format.rows}
              x2={format.w}
              y2={((i + 1) * format.h) / format.rows}
            />
          ))}
        </g>
      )}

      {overlay.selection.map((r, i) => (
        <g key={i}>
          <rect
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill="none"
            stroke="#000"
            strokeWidth={px(0.0015)}
          />
          {HANDLES.map((h) => {
            const pt = handlePoint(r, h)
            return (
              <rect
                key={h}
                x={pt.x - handleSize / 2}
                y={pt.y - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="#fff"
                stroke="#000"
                strokeWidth={px(0.0012)}
              />
            )
          })}
        </g>
      ))}

      {overlay.ghost?.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill="rgba(255,102,158,0.15)"
          stroke={OUTLINE_COLOR}
          strokeWidth={px(0.003)}
        />
      ))}

      {overlay.marquee && (
        <rect
          x={overlay.marquee.x}
          y={overlay.marquee.y}
          width={overlay.marquee.w}
          height={overlay.marquee.h}
          fill="rgba(0,0,0,0.04)"
          stroke="#000"
          strokeWidth={px(0.0015)}
          strokeDasharray={`${px(0.008)} ${px(0.008)}`}
        />
      )}
    </svg>
  )
}
