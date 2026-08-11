import { IconChoice } from '../core/ui'
import { useDeck, type Tool } from '../store/useDeck'

function IconFrame({ children }: { children: React.ReactNode }) {
  return (
    <svg width={24} height={18} viewBox="0 0 24 18" fill="none" stroke="currentColor">
      {children}
    </svg>
  )
}

const PointerIcon = () => (
  <IconFrame>
    <path d="M9 3 L9 14 L11.6 11.4 L13.4 15 L15 14.2 L13.2 10.7 L16.5 10.5 Z" strokeWidth={1.2} />
  </IconFrame>
)

const TextIcon = () => (
  <IconFrame>
    <path d="M6 4 H18 M12 4 V14 M9.5 14 H14.5" strokeWidth={1.2} strokeLinecap="square" />
  </IconFrame>
)

/**
 * What a click on empty canvas does. Without this the gesture is ambiguous —
 * a click would have to mean both "deselect" and "start a new text box", and
 * whichever one lost would feel broken.
 *
 * The text tool is one-shot: it drops a box, then falls back to the pointer, so
 * you can immediately drag what you just made.
 */
export function ToolToggle() {
  const tool = useDeck((s) => s.tool)
  const setTool = useDeck((s) => s.setTool)

  return (
    <IconChoice<Tool>
      label="Tool"
      value={tool}
      cols={2}
      onChange={setTool}
      options={[
        { value: 'pointer', icon: <PointerIcon />, title: 'Select, move and resize (V)' },
        { value: 'text', icon: <TextIcon />, title: 'Click the canvas to add text (T)' },
      ]}
    />
  )
}
