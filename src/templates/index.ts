import { getFormat, type FormatId } from '../config/formats'
import type { PageElement } from '../doc/types'
import { grid } from '../render/grid'
import { REPORT_TEMPLATES } from './report'
import { SLIDE_TEMPLATES } from './slides'
import type { Template } from './types'

export type { Template } from './types'

export const ALL_TEMPLATES: Template[] = [...SLIDE_TEMPLATES, ...REPORT_TEMPLATES]

export const templatesFor = (format: FormatId): Template[] =>
  ALL_TEMPLATES.filter((t) => t.formats.includes(format))

/** Build a template's elements against a format's grid, at its base size. */
export function buildTemplate(template: Template, format: FormatId): PageElement[] {
  const f = getFormat(format)
  return template.build({ format: f, g: grid(f.w, f.h, f.cols, f.rows) })
}
