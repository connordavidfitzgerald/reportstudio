/**
 * Draw-recorder checks — `npm run check:record`.
 *
 * Recording can't drift from the canvas on *geometry* — the real draw functions
 * produce both, so there is only one source of it. What can still be wrong is the
 * state machine (save/restore nesting, clips, path assembly) and `replayOps`,
 * which is the reference semantics the PDF painter has to agree with.
 *
 * The strongest check here is the round-trip: record a sequence, replay it into a
 * second recorder, and assert the two op lists are identical. That pins replay as
 * the exact inverse of recording, which is what makes it usable as the spec for
 * a second backend.
 */
import assert from 'node:assert/strict'
import { createRecorder, replayOps } from '../src/render/record.ts'

/** Text metrics aren't exercised here; the recorder only delegates to this. */
const metricsStub = () => ({
  font: '',
  textBaseline: 'alphabetic',
  measureText: (t) => ({ width: t.length * 10, actualBoundingBoxAscent: 8 }),
})

const rec = () => createRecorder(metricsStub())

// -- style capture -----------------------------------------------------------
{
  const { ctx, ops } = rec()
  ctx.fillStyle = '#FF669E'
  ctx.globalAlpha = 0.4
  ctx.globalCompositeOperation = 'soft-light'
  ctx.fillRect(10, 20, 30, 40)

  assert.equal(ops.length, 1)
  assert.deepEqual(ops[0].rect, { x: 10, y: 20, w: 30, h: 40 })
  assert.equal(ops[0].style.fill, '#FF669E', 'fill is captured at draw time')
  assert.equal(ops[0].style.alpha, 0.4)
  assert.equal(ops[0].style.composite, 'soft-light')
  assert.equal(ops[0].style.clip, null)
}

// -- save / restore ----------------------------------------------------------
{
  const { ctx, ops } = rec()
  ctx.fillStyle = '#000'
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.globalAlpha = 0.5
  ctx.fillRect(0, 0, 1, 1)
  ctx.restore()
  ctx.fillRect(0, 0, 2, 2)

  assert.equal(ops[0].style.fill, '#fff', 'inner state applies inside save/restore')
  assert.equal(ops[0].style.alpha, 0.5)
  assert.equal(ops[1].style.fill, '#000', 'restore puts the old state back')
  assert.equal(ops[1].style.alpha, 1)
}

// -- clip is state, and is restored -----------------------------------------
{
  const { ctx, ops } = rec()
  ctx.save()
  ctx.beginPath()
  ctx.rect(5, 6, 100, 200)
  ctx.clip()
  ctx.drawImage({ tag: 'img' }, 0, 0, 50, 50)
  ctx.restore()
  ctx.fillRect(0, 0, 1, 1)

  assert.deepEqual(ops[0].style.clip, { x: 5, y: 6, w: 100, h: 200 }, 'rect clip recorded')
  assert.equal(ops[1].style.clip, null, 'clip does not survive restore')
}

// A clip the PDF backend could not express must fail loudly, not silently drop.
{
  const { ctx } = rec()
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(10, 0)
  ctx.lineTo(5, 9)
  assert.throws(() => ctx.clip(), /only rectangular clips/, 'non-rect clip is refused')
}

// -- path assembly (the notched outline's unioned rings) --------------------
{
  const { ctx, ops } = rec()
  ctx.fillStyle = '#FF669E'
  ctx.beginPath()
  ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.lineTo(10, 5); ctx.lineTo(0, 5); ctx.closePath()
  ctx.moveTo(20, 0); ctx.lineTo(30, 0); ctx.lineTo(30, 5); ctx.closePath()
  ctx.fill()

  assert.equal(ops.length, 1)
  assert.equal(ops[0].op, 'path')
  assert.equal(ops[0].rings.length, 2, 'two closed rings')
  assert.deepEqual(ops[0].rings[0][2], { x: 10, y: 5 })
  assert.equal(ops[0].style.fill, '#FF669E')
}

// -- text runs ---------------------------------------------------------------
{
  const { ctx, ops } = rec()
  ctx.font = '800 53.75px "Review Condensed"'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  // drawHeaderBlock emits one call per grapheme, at exact measured advances.
  ctx.fillText('T', 40, 100)
  ctx.fillText('O', 62.5, 100)

  assert.equal(ops.length, 2, 'per-grapheme runs are preserved, not merged')
  assert.equal(ops[1].text, 'O')
  assert.equal(ops[1].x, 62.5, 'exact advance survives')
  assert.equal(ops[1].style.font, '800 53.75px "Review Condensed"')
  assert.equal(ops[1].style.baseline, 'alphabetic')
}

// -- unimplemented members fail loudly --------------------------------------
{
  const { ctx } = rec()
  assert.throws(
    () => ctx.setLineDash([2, 2]),
    /not implemented/,
    'an unknown canvas member must throw rather than silently vanish from exports',
  )
}

// -- round-trip: replay is the exact inverse of recording --------------------
{
  const { ctx, ops } = rec()
  const img = { tag: 'photo' }

  ctx.fillStyle = '#99CC00'
  ctx.fillRect(0, 0, 1240, 1754)
  ctx.save()
  ctx.beginPath()
  ctx.rect(100, 100, 400, 300)
  ctx.clip()
  ctx.drawImage(img, 90, 90, 420, 320)
  ctx.restore()
  ctx.fillStyle = '#FF669E'
  ctx.beginPath()
  ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.lineTo(10, 5); ctx.closePath()
  ctx.fill()
  ctx.font = '500 12.64px "Neue Haas Grotesk"'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.fillText('Tools for Change', 40, 220)
  ctx.globalAlpha = 0.4
  ctx.globalCompositeOperation = 'soft-light'
  ctx.drawImage(img, 0, 0, 1240, 1754)

  const second = rec()
  replayOps(second.ctx, ops)

  assert.deepEqual(second.ops, ops, 'replaying recorded ops re-records them identically')
  assert.equal(ops.length, 5, 'background, image, path, text, grain overlay')
  assert.equal(ops.at(-1).style.composite, 'soft-light', 'the grain overlay sits on top, blended')
}

console.log('record ok — state, clips, paths, glyph runs, and replay round-trip')
