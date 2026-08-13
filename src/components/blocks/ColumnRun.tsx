import { useState } from 'react'
import type { Block } from '../../doc/blocks'
import { useDeck } from '../../store/useDeck'
import { COLUMN_RUNS } from './options'

/**
 * How wide a component is, in the nine columns of the measure.
 *
 * This used to be two number inputs labelled "Columns", 0–8 and 1–9. They are
 * the most designer-facing control in the editor and the least explicable: a
 * client has no way to know that `1 → 7` is the inset a pull quote wants, or
 * that `4 → 5` is where the file puts an author's portrait.
 *
 * The named runs live in `./options` as {@link COLUMN_RUNS}, shared with the
 * canvas toolbar. They are not invented: they are the four the *Tools for
 * Change* file actually uses, so choosing one lands on a real column line by
 * construction and the grid stays intact without anyone thinking about it.
 *
 * The numbers are still there, one disclosure away, because a twelfth spread
 * may well need a run these four don't cover.
 */

const COLS = 9

const RUNS = COLUMN_RUNS

/** Nine ticks with the occupied ones filled — the run, at a glance. */
function RunGlyph({ col, span, on }: { col: number; span: number; on: boolean }) {
  return (
    <span className="flex h-2 w-full gap-[1px]" aria-hidden>
      {Array.from({ length: COLS }, (_, i) => (
        <span
          key={i}
          className={`flex-1 ${
            i >= col && i < col + span
              ? on
                ? 'bg-card'
                : 'bg-ink'
              : on
                ? 'bg-card/25'
                : 'bg-ink/25'
          }`}
        />
      ))}
    </span>
  )
}

export function ColumnRun({ block }: { block: Block }) {
  const updateBlock = useDeck((s) => s.updateBlock)
  const col = block.col ?? 0
  const span = block.span ?? COLS - col
  const match = RUNS.find((r) => r.col === col && r.span === span)
  const [advanced, setAdvanced] = useState(!match)

  const set = (next: { col: number; span: number }) =>
    updateBlock(block.id, {
      col: next.col,
      // Never let a run hang off the right edge of the measure.
      span: Math.max(1, Math.min(next.span, COLS - next.col)),
    })

  return (
    <div className="flex flex-col gap-1.5 px-1">
      <div className="flex items-baseline justify-between">
        <span className="text-2xs leading-none text-dim">Width</span>
        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          className="text-[10px] uppercase tracking-wide text-dim hover:text-ink"
        >
          {advanced ? 'Presets' : 'Exact'}
        </button>
      </div>

      {advanced ? (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-dim">
            From
            <input
              type="number"
              min={0}
              max={COLS - 1}
              value={col}
              onChange={(e) => set({ col: Number(e.target.value), span })}
              className="w-14 border border-ink/25 p-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-dim">
            Across
            <input
              type="number"
              min={1}
              max={COLS - col}
              value={span}
              onChange={(e) => set({ col, span: Number(e.target.value) })}
              className="w-14 border border-ink/25 p-1 text-xs"
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1">
          {RUNS.map((run) => {
            const on = match?.id === run.id
            return (
              <button
                key={run.id}
                type="button"
                onClick={() => set(run)}
                className={`flex flex-col gap-1 border px-1.5 py-1 text-left text-[11px] transition
                  ${on ? 'border-ink bg-ink text-card' : 'border-ink/25 hover:border-ink'}`}
              >
                <RunGlyph col={run.col} span={run.span} on={on} />
                {run.label}
              </button>
            )
          })}
        </div>
      )}

      {!advanced && !match && (
        <p className="text-[11px] leading-snug text-dim">
          This component sits on a custom run ({col} → {col + span}). Press <em>Exact</em> to see it.
        </p>
      )}
    </div>
  )
}
