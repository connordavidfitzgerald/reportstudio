import { useRef, useState, type ReactNode } from 'react'
import type { SurfaceId } from '../../config/brand'
import { setLang as setLocalized, t, type LocalizedText } from '../../doc/localized'
import { CHAPTER_PRESETS, chaptersInUse, sectionsInChapter } from '../../doc/types'
import { OFFERED_TEMPLATES, templateById } from '../../templates'
import { useConfirm } from '../../hooks/useConfirm'
import { useCurrentLeaf, useDeck } from '../../store/useDeck'
import { SURFACE_OPTIONS } from '../blocks/options'
import { Dropdown, DropdownItem, Pill, subLabelClass } from '../ui'

/**
 * What this page *is*: which chapter it belongs to, what it's called, what it's
 * printed on, and which shape it started from.
 *
 * Four rows, each a label and a pill. Everything that used to be here and is
 * about a *component* rather than a page — the text size, the column run, every
 * text field — is now on the canvas, next to the thing it changes.
 */

/** A label and the pill that opens its menu. */
function Row({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const row = useRef<HTMLDivElement>(null)
  return (
    <div ref={row} className="relative flex items-center justify-between gap-2.5">
      {/* The label holds its width; the value gives way and truncates. */}
      <span className={`${subLabelClass} shrink-0`}>{label}</span>
      <Pill
        open={open}
        title={value}
        className="min-w-0 shrink"
        onClick={() => setOpen((o) => !o)}
      >
        {value}
      </Pill>
      {open && (
        <Dropdown align="right" boundary={row} clamp onClose={() => setOpen(false)}>
          {children(() => setOpen(false))}
        </Dropdown>
      )}
    </div>
  )
}

/**
 * A menu row that turns into a text field.
 *
 * The chapter and section lists are suggestions, not a closed set — this report
 * has six chapters, the next one will have different ones — so both menus end
 * with a way to type your own without leaving the menu.
 */
function TypeYourOwn({ placeholder, onCommit }: { placeholder: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState('')
  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        const next = draft.trim()
        if (next) onCommit(next)
      }}
      className="w-full min-w-0 bg-transparent text-xs leading-tight text-ink outline-none placeholder:text-dim"
    />
  )
}

export function PageSettings() {
  const leaf = useCurrentLeaf()
  const leafIndex = useDeck((s) => s.leafIndex)
  const deck = useDeck((s) => s.deck)
  const lang = deck.lang
  const updateLeaf = useDeck((s) => s.updateLeaf)
  const applyTemplate = useDeck((s) => s.applyTemplate)
  const confirm = useConfirm()

  /** Write one edition of a localized field, leaving the other alone. */
  const write = (field: 'chapter' | 'section', prev: LocalizedText | undefined, value: string) =>
    updateLeaf(leafIndex, { [field]: setLocalized(prev, lang, value) })

  const chapter = t(leaf.chapter, lang)
  const section = t(leaf.section, lang)
  const template = leaf.templateId ? templateById(leaf.templateId) : undefined

  // The six built-in chapters, then whatever this document has added to them.
  const used = chaptersInUse(deck, lang)
  const chapters = [...CHAPTER_PRESETS, ...used.filter((c) => !CHAPTER_PRESETS.includes(c as never))]
  const sections = sectionsInChapter(deck, chapter.trim(), lang).filter((s) => s !== section)

  const applyShape = async (id: string, label: string) => {
    const n = leaf.blocks.length
    if (
      n > 0 &&
      !(await confirm({
        title: `Use the “${label}” shape?`,
        body: `This replaces the ${n} component${n === 1 ? '' : 's'} already on this page. Undo will bring them back.`,
        confirmLabel: 'Replace the page',
      }))
    ) {
      return
    }
    applyTemplate(leafIndex, id)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Row label="Chapter" value={chapter || 'None'}>
        {(close) => (
          <>
            {chapters.map((name) => (
              <DropdownItem
                key={name}
                current={chapter === name}
                onClick={() => {
                  write('chapter', leaf.chapter, name)
                  close()
                }}
              >
                {name}
              </DropdownItem>
            ))}
            <TypeYourOwn
              placeholder="Enter chapter title"
              onCommit={(v) => {
                write('chapter', leaf.chapter, v)
                close()
              }}
            />
          </>
        )}
      </Row>

      {/*
        The section is the finer of the two and the one that prints. Clearing it
        is "same as chapter" — not a separate flag, because two ways to say the
        same thing is how they end up disagreeing.

        The list is every section already used *in this chapter*, so a section
        that runs over several pages is typed once and picked thereafter.
      */}
      <Row label="Section" value={section || 'Same as chapter'}>
        {(close) => (
          <>
            <DropdownItem
              current={!section}
              onClick={() => {
                updateLeaf(leafIndex, { section: undefined })
                close()
              }}
            >
              Same as chapter
            </DropdownItem>
            {section && <DropdownItem current onClick={close}>{section}</DropdownItem>}
            {sections.map((name) => (
              <DropdownItem
                key={name}
                onClick={() => {
                  write('section', leaf.section, name)
                  close()
                }}
              >
                {name}
              </DropdownItem>
            ))}
            <TypeYourOwn
              placeholder="Enter section title"
              onCommit={(v) => {
                write('section', leaf.section, v)
                close()
              }}
            />
          </>
        )}
      </Row>

      <Row
        label="Paper colour"
        value={SURFACE_OPTIONS.find((o) => o.value === leaf.surface)?.label ?? leaf.surface}
      >
        {(close) => (
          <>
            {SURFACE_OPTIONS.map(({ value, label }) => (
              <DropdownItem
                key={value}
                current={leaf.surface === value}
                onClick={() => {
                  updateLeaf(leafIndex, { surface: value as SurfaceId })
                  close()
                }}
              >
                {label}
              </DropdownItem>
            ))}
          </>
        )}
      </Row>

      <Row label="Template" value={template?.label ?? 'Blank'}>
        {(close) => (
          <>
            {OFFERED_TEMPLATES.map((tpl) => (
              <DropdownItem
                key={tpl.id}
                current={leaf.templateId === tpl.id}
                onClick={() => {
                  close()
                  void applyShape(tpl.id, tpl.label)
                }}
              >
                {tpl.label}
              </DropdownItem>
            ))}
          </>
        )}
      </Row>
    </div>
  )
}
