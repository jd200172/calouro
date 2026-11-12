// Geometria do passeio, em metros, a partir dos polígonos da planta.
// A escala vem da soma das áreas rotuladas; os contornos foram traçados à mão.

import { escala, type Door, type Planta, type Pt, type Room } from '../data/edimburgo'

export const ALTURA = 2.6
export const OLHO = 1.55
export const ESP = 0.1
export const PISO = 0.045
export const RAIO = 0.17

export type Block = { minX: number; maxX: number; minZ: number; maxZ: number }
export type Collider = { ax: number; az: number; bx: number; bz: number }

export type Vec = { x: number; z: number }

export type RoomPoly = {
  id: string
  nome: string
  area: number
  tipo: Room['tipo']
  foto?: string
  poly: Vec[]
  interior: Vec
  clearance: number
}

export type Opening = {
  a: Vec
  b: Vec
  mid: Vec
  len: number
  tipo: 'porta' | 'vao' | 'correr'
  rooms: string[]
  /** Direção horizontal para onde a folha abre. */
  inward: Vec
  hinge: Vec
  /** Ângulo da folha no plano XZ (radianos), alinhado ao comprimento. */
  angle: number
  width: number
}

export type WallPiece = {
  a: Vec
  b: Vec
  kind: 'solid' | 'window' | 'rail' | 'high'
  /** Normal apontando para o cômodo principal (lado de dentro). */
  inward: Vec
  roomId?: string
}

export type PlanGeom = {
  rooms: RoomPoly[]
  openings: Opening[]
  walls: WallPiece[]
  center: Vec
  span: number
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  inicio: Vec
  scale: number
  cx: number
  cy: number
}

const v = (x: number, z: number): Vec => ({ x, z })
const add = (a: Vec, b: Vec, s = 1): Vec => ({ x: a.x + b.x * s, z: a.z + b.z * s })
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, z: a.z - b.z })
const len = (a: Vec) => Math.hypot(a.x, a.z)
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z)
const dot = (a: Vec, b: Vec) => a.x * b.x + a.z * b.z
const unit = (a: Vec): Vec => {
  const l = len(a) || 1
  return { x: a.x / l, z: a.z / l }
}
const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })

export function inside(p: Vec, poly: Vec[]) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i]
    const pj = poly[j]
    if (pi.z > p.z !== pj.z > p.z && p.x < ((pj.x - pi.x) * (p.z - pi.z)) / (pj.z - pi.z) + pi.x) c = !c
  }
  return c
}

function distSeg(p: Vec, a: Vec, b: Vec) {
  const ab = sub(b, a)
  const l2 = dot(ab, ab) || 1
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
  return dist(p, add(a, ab, t))
}

function distToEdges(p: Vec, poly: Vec[]) {
  let d = Infinity
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distSeg(p, poly[i], poly[(i + 1) % poly.length]))
  return d
}

function clean(poly: Vec[]) {
  const out: Vec[] = []
  for (const p of poly) {
    if (!out.length || dist(out[out.length - 1], p) > 0.025) out.push(p)
  }
  if (out.length > 2 && dist(out[0], out[out.length - 1]) <= 0.025) out.pop()
  // remove colinear
  const simp: Vec[] = []
  for (let i = 0; i < out.length; i++) {
    const prev = out[(i + out.length - 1) % out.length]
    const next = out[(i + 1) % out.length]
    const a = unit(sub(out[i], prev))
    const b = unit(sub(next, out[i]))
    if (Math.abs(a.x * b.z - a.z * b.x) < 0.02 && dot(a, b) > 0.98) continue
    simp.push(out[i])
  }
  return simp.length >= 3 ? simp : out
}

function clusterFn(values: number[], tol = 0.16, maxSpan = 0.22) {
  const uniq = [...new Set(values.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b)
  const rep = new Map<number, number>()
  let i = 0
  while (i < uniq.length) {
    let j = i
    while (j + 1 < uniq.length && uniq[j + 1] - uniq[j] <= tol && uniq[j + 1] - uniq[i] <= maxSpan) j++
    const grp = uniq.slice(i, j + 1)
    const mean = grp.reduce((s, n) => s + n, 0) / grp.length
    for (const n of grp) rep.set(n, mean)
    i = j + 1
  }
  return (n: number) => rep.get(Math.round(n * 1000) / 1000) ?? n
}

function interiorOf(poly: Vec[]) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of poly) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  const step = Math.max(0.1, Math.min(0.22, Math.min(maxX - minX, maxZ - minZ) / 10))
  let best: Vec | null = null
  let bestD = -1
  for (let x = minX + step * 0.5; x < maxX; x += step) {
    for (let z = minZ + step * 0.5; z < maxZ; z += step) {
      const p = v(x, z)
      if (!inside(p, poly)) continue
      const d = distToEdges(p, poly)
      if (d > bestD) {
        bestD = d
        best = p
      }
    }
  }
  if (!best) {
    best = {
      x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
      z: poly.reduce((s, p) => s + p.z, 0) / poly.length,
    }
    bestD = 0
  }
  return { interior: best, clearance: bestD }
}

type Interval = [number, number]

function subtractIntervals(base: Interval[], cuts: Interval[]) {
  let parts = base
  for (const c of cuts) {
    parts = parts.flatMap(([s, e]) => {
      if (c[1] <= s + 0.02 || c[0] >= e - 0.02) return [[s, e] as Interval]
      const r: Interval[] = []
      if (c[0] > s + 0.02) r.push([s, c[0]])
      if (c[1] < e - 0.02) r.push([c[1], e])
      return r
    })
  }
  return parts.filter(([s, e]) => e - s > 0.04)
}

function roomOf(p: Vec, rooms: RoomPoly[]) {
  return rooms.find((r) => inside(p, r.poly))
}

function inwardOf(a: Vec, b: Vec, rooms: RoomPoly[]) {
  const d = sub(b, a)
  const l = len(d) || 1
  const n1 = v(-d.z / l, d.x / l)
  const mid = lerp(a, b, 0.5)
  const r1 = roomOf(add(mid, n1, 0.12), rooms)
  if (r1) return { inward: n1, room: r1, other: roomOf(add(mid, n1, -0.12), rooms) }
  const r2 = roomOf(add(mid, n1, -0.12), rooms)
  if (r2) return { inward: v(-n1.x, -n1.z), room: r2, other: undefined }
  return { inward: n1, room: undefined, other: undefined }
}

const PRIV: Record<Room['tipo'], number> = { intimo: 4, molhado: 3, social: 2, tecnico: 1, externo: 0 }

function swingRoom(a: RoomPoly | undefined, b: RoomPoly | undefined) {
  if (a && b) return PRIV[a.tipo] >= PRIV[b.tipo] ? a : b
  return a ?? b
}

function rotateToward(along: Vec, inward: Vec, deg: number) {
  const alongAng = Math.atan2(along.z, along.x)
  const inAng = Math.atan2(inward.z, inward.x)
  let delta = inAng - alongAng
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  const mag = Math.min(Math.abs(delta), (deg * Math.PI) / 180)
  return alongAng + Math.sign(delta || 1) * mag
}

function makeOpening(a: Vec, b: Vec, rooms: RoomPoly[]): Opening {
  const l = dist(a, b)
  const mid = lerp(a, b, 0.5)
  const info = inwardOf(a, b, rooms)
  const d = sub(b, a)
  const ll = len(d) || 1
  const n = v(-d.z / ll, d.x / ll)
  const sideA = roomOf(add(mid, n, 0.14), rooms)
  const sideB = roomOf(add(mid, n, -0.14), rooms)
  const ids = [sideA?.id, sideB?.id].filter((id): id is string => !!id)
  const tipos = [sideA, sideB].filter((r): r is RoomPoly => !!r)
  const hasExt = tipos.some((r) => r.tipo === 'externo')
  let tipo: Opening['tipo'] = 'porta'
  if (l >= 1.4 && hasExt) tipo = 'correr'
  else if (l >= 1.5 && tipos.length >= 2) tipo = 'vao'

  const dest = swingRoom(sideA, sideB)
  const inward = dest
    ? unit(sub(dest.interior, mid))
    : info.inward

  const width = Math.max(0.4, l - 0.04)
  let hinge = a
  let along = unit(sub(b, a))
  let angle = rotateToward(along, inward, tipo === 'porta' ? 68 : 0)

  if (tipo === 'porta') {
    const score = (h: Vec, o: Vec) => {
      const al = unit(sub(o, h))
      const ang = rotateToward(al, inward, 68)
      const dir = v(Math.cos(ang), Math.sin(ang))
      const center = add(h, dir, width * 0.5)
      const host = dest && inside(center, dest.poly) ? 2 : 0
      const clear = dest ? distToEdges(center, dest.poly) : 0
      return host * 10 + clear
    }
    if (score(b, a) > score(a, b)) {
      hinge = b
      along = unit(sub(a, b))
      angle = rotateToward(along, inward, 68)
    }
  }

  return { a, b, mid, len: l, tipo, rooms: ids, inward, hinge, angle, width }
}

function splitWall(a: Vec, b: Vec, owner: RoomPoly, rooms: RoomPoly[]): WallPiece[] {
  const d = sub(b, a)
  const length = len(d)
  const u = length > 0.001 ? { x: d.x / length, z: d.z / length } : v(1, 0)
  const n = v(-u.z, u.x)
  const mid = lerp(a, b, 0.5)
  const inward = inside(add(mid, n, 0.12), owner.poly) ? n : v(-n.x, -n.z)
  const exterior = !rooms.some((r) => r.id !== owner.id && inside(add(mid, inward, -0.16), r.poly))
  const solid = (): WallPiece => ({ a, b, kind: 'solid', inward, roomId: owner.id })
  if (!exterior || owner.tipo === 'tecnico') return [solid()]
  if (owner.tipo === 'externo') return [{ a, b, kind: 'rail', inward, roomId: owner.id }]
  if (length < 1.2) return [solid()]

  const kind: WallPiece['kind'] = owner.tipo === 'molhado' ? 'high' : 'window'
  if (kind === 'high' && length < 1.35) return [solid()]

  const count = length > 4 ? 2 : 1
  const maxW = kind === 'high' ? 0.95 : 1.4
  const win = Math.min(maxW, (length - 0.42 * (count + 1)) / count)
  if (win < 0.7) return [solid()]

  const mull = (length - count * win) / (count + 1)
  const out: WallPiece[] = []
  const at = (t0: number, t1: number, k: WallPiece['kind']) => {
    if (t1 - t0 < 0.05) return
    out.push({
      a: add(a, u, t0),
      b: add(a, u, t1),
      kind: k,
      inward,
      roomId: owner.id,
    })
  }
  let cursor = 0
  for (let i = 0; i < count; i++) {
    at(cursor, cursor + mull, 'solid')
    cursor += mull
    at(cursor, cursor + win, kind)
    cursor += win
  }
  at(cursor, length, 'solid')
  return out
}

function sameLineOverlap(a: Vec, b: Vec, c: Vec, d: Vec) {
  const horiz = Math.abs(a.z - b.z) < 0.05 && Math.abs(c.z - d.z) < 0.05 && Math.abs(a.z - c.z) < 0.07
  const vert = Math.abs(a.x - b.x) < 0.05 && Math.abs(c.x - d.x) < 0.05 && Math.abs(a.x - c.x) < 0.07
  if (!horiz && !vert) return 0
  const a0 = horiz ? Math.min(a.x, b.x) : Math.min(a.z, b.z)
  const a1 = horiz ? Math.max(a.x, b.x) : Math.max(a.z, b.z)
  const b0 = horiz ? Math.min(c.x, d.x) : Math.min(c.z, d.z)
  const b1 = horiz ? Math.max(c.x, d.x) : Math.max(c.z, d.z)
  return Math.min(a1, b1) - Math.max(a0, b0)
}

export function buildGeom(pl: Planta): PlanGeom {
  const s = escala(pl)
  const xs = pl.rooms.flatMap((r) => r.poly.map((p) => p[0]))
  const ys = pl.rooms.flatMap((r) => r.poly.map((p) => p[1]))
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const toW = (p: Pt): Vec => v((p[0] - cx) * s, (p[1] - cy) * s)

  const rawPts: Vec[] = []
  for (const r of pl.rooms) for (const p of r.poly) rawPts.push(toW(p))
  for (const d of pl.doors) {
    rawPts.push(toW(d.a), toW(d.b))
  }
  const snapX = clusterFn(rawPts.map((p) => p.x))
  const snapZ = clusterFn(rawPts.map((p) => p.z))
  const snap = (p: Vec): Vec => v(snapX(p.x), snapZ(p.z))

  const rooms: RoomPoly[] = pl.rooms.map((r) => {
    const poly = clean(r.poly.map((p) => snap(toW(p))))
    const info = interiorOf(poly)
    return { id: r.id, nome: r.nome, area: r.area, tipo: r.tipo, foto: r.foto, poly, ...info }
  })

  const doors: Door[] = pl.doors
  const openings = doors.map((d) => makeOpening(snap(toW(d.a)), snap(toW(d.b)), rooms))

  // Cada aresta de cômodo vira parede. Fachadas longas não são fundidas, para a varanda
  // ganhar guarda-corpo e os quartos, janela. Aresta compartilhada entra uma vez só.
  const walls: WallPiece[] = []
  const emitted: { a: Vec; b: Vec }[] = []
  for (const room of rooms) {
    for (let i = 0; i < room.poly.length; i++) {
      const a = room.poly[i]
      const b = room.poly[(i + 1) % room.poly.length]
      const edgeLen = dist(a, b)
      if (edgeLen < 0.2) continue
      const dir = unit(sub(b, a))
      const cuts: Interval[] = []
      for (const o of openings) {
        if (distSeg(o.mid, a, b) > 0.12) continue
        const t0 = dot(sub(o.a, a), dir)
        const t1 = dot(sub(o.b, a), dir)
        const s0 = Math.max(0, Math.min(t0, t1))
        const s1 = Math.min(edgeLen, Math.max(t0, t1))
        if (s1 - s0 > 0.08) cuts.push([s0, s1])
      }
      for (const [s0, s1] of subtractIntervals([[0, edgeLen]], cuts)) {
        const pa = add(a, dir, s0)
        const pb = add(a, dir, s1)
        if (emitted.some((e) => sameLineOverlap(pa, pb, e.a, e.b) > 0.12)) continue
        const pieces = splitWall(pa, pb, room, rooms)
        for (const p of pieces) {
          walls.push(p)
          emitted.push({ a: p.a, b: p.b })
        }
      }
    }
  }

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const r of rooms) {
    for (const p of r.poly) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z)
      maxZ = Math.max(maxZ, p.z)
    }
  }
  const center = v((minX + maxX) / 2, (minZ + maxZ) / 2)
  const span = Math.max(maxX - minX, maxZ - minZ)

  return {
    rooms,
    openings,
    walls,
    center,
    span,
    bounds: { minX, maxX, minZ, maxZ },
    inicio: toW(pl.inicio),
    scale: s,
    cx,
    cy,
  }
}

export function toPx(g: PlanGeom, p: Vec): Pt {
  return [p.x / g.scale + g.cx, p.z / g.scale + g.cy]
}

/** true se o visitante não pode ocupar esse ponto (parede, móvel ou fora do apartamento). */
export function blocked(x: number, z: number, blocks: Block[], cols: Collider[], polys: Vec[][], thresholds: Vec[]) {
  const p = v(x, z)
  let home = false
  for (const poly of polys) {
    if (inside(p, poly)) {
      home = true
      break
    }
  }
  if (!home) {
    let near = false
    for (const t of thresholds) {
      if (dist(p, t) < 0.42) {
        near = true
        break
      }
    }
    if (!near) return true
  }
  const lim = RAIO + ESP / 2 - 0.012
  for (const c of cols) {
    if (distSeg(p, v(c.ax, c.az), v(c.bx, c.bz)) < lim) return true
  }
  const r2 = (RAIO - 0.02) * (RAIO - 0.02)
  for (const b of blocks) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX))
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ))
    const dx = x - cx
    const dz = z - cz
    if (dx * dx + dz * dz < r2) return true
  }
  return false
}
