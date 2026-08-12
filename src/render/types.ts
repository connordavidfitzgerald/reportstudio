/**
 * Geometry shared by the renderer and the PDF export.
 *
 * Deliberately tiny. This file used to carry palettes, paper presets, halftone
 * parameters and a text-block contract, all inherited from the poster app;
 * none of it described the report design and all of it is gone.
 */

export type Rect = { x: number; y: number; w: number; h: number }

/** Horizontal alignment, shared by every text primitive. */
export type TextAlign = 'left' | 'center' | 'right'
