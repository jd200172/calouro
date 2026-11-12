// Monta a maquete: pisos, paredes com vãos, mobiliário simples e a rota da visita.
// Tudo é ilustrativo — a escala sai das áreas da planta e os contornos são aproximados.

import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Planta, Room } from '../data/edimburgo'
import {
  ALTURA,
  ESP,
  OLHO,
  PISO,
  blocked,
  buildGeom,
  inside,
  type Block,
  type Collider,
  type Opening,
  type PlanGeom,
  type RoomPoly,
  type Vec,
  type WallPiece,
} from './geom'

export type TourStop = {
  roomId: string
  nome: string
  area: number
  foto?: string
  eye: THREE.Vector3
  look: THREE.Vector3
}

export type Apartment = {
  scene: THREE.Scene
  floors: THREE.Mesh[]
  rooms: RoomPoly[]
  blocks: Block[]
  cols: Collider[]
  thresholds: Vec[]
  geom: PlanGeom
  tour: TourStop[]
  spawn: Vec
  doll: { pos: THREE.Vector3; target: THREE.Vector3 }
  clip: THREE.Plane
  dispose: () => void
}

// Ordem de uma visita real, da entrada social até os quartos.
const ORDEM: Record<string, string[]> = {
  a: ['estar', 'cozinha', 'servico', 'varanda', 'circulacao', 'bwc1', 'dormitorio', 'tecnica', 'suite', 'bwc2'],
  b: ['estar', 'cozinha', 'servico', 'varanda', 'circulacao', 'bwc1', 'dormitorio', 'tecnica', 'suite', 'bwc2'],
}

const add = (a: Vec, b: Vec, s = 1): Vec => ({ x: a.x + b.x * s, z: a.z + b.z * s })
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, z: a.z - b.z })
const dot = (a: Vec, b: Vec) => a.x * b.x + a.z * b.z
const len = (a: Vec) => Math.hypot(a.x, a.z)
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z)
const unit = (a: Vec): Vec => {
  const l = len(a) || 1
  return { x: a.x / l, z: a.z / l }
}
const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
const mid = (a: Vec, b: Vec) => lerp(a, b, 0.5)

function distSeg(p: Vec, a: Vec, b: Vec) {
  const ab = sub(b, a)
  const l2 = dot(ab, ab) || 1
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
  return dist(p, add(a, ab, t))
}

function yawOf(inward: Vec) {
  return Math.atan2(inward.x, inward.z)
}

function wallYaw(a: Vec, b: Vec) {
  return -Math.atan2(b.z - a.z, b.x - a.x)
}

function rightOf(yaw: number): Vec {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) }
}
function fwdOf(yaw: number): Vec {
  return { x: Math.sin(yaw), z: Math.cos(yaw) }
}

function footprint(x: number, z: number, w: number, d: number, yaw: number): Vec[] {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return [
    [w / 2, d / 2],
    [w / 2, -d / 2],
    [-w / 2, d / 2],
    [-w / 2, -d / 2],
  ].map(([lx, lz]) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c }))
}

function toBlock(pts: Vec[], shrink = 0): Block {
  return {
    minX: Math.min(...pts.map((p) => p.x)) + shrink,
    maxX: Math.max(...pts.map((p) => p.x)) - shrink,
    minZ: Math.min(...pts.map((p) => p.z)) + shrink,
    maxZ: Math.max(...pts.map((p) => p.z)) - shrink,
  }
}

function overlaps(a: Block, b: Block, pad = 0.05) {
  return a.minX < b.maxX - pad && a.maxX > b.minX + pad && a.minZ < b.maxZ - pad && a.maxZ > b.minZ + pad
}

function bbox(poly: Vec[]) {
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
  return { minX, maxX, minZ, maxZ, w: maxX - minX, d: maxZ - minZ }
}

function rayInside(origin: Vec, dir: Vec, poly: Vec[]) {
  let last = 0
  for (let t = 0.06; t < 6; t += 0.05) {
    if (!inside(add(origin, dir, t), poly)) return last
    last = t
  }
  return last
}

type Edge = { a: Vec; b: Vec; len: number; inward: Vec; exterior: boolean; dir: Vec }

function edgesOf(room: RoomPoly, rooms: RoomPoly[]): Edge[] {
  const out: Edge[] = []
  for (let i = 0; i < room.poly.length; i++) {
    const a = room.poly[i]
    const b = room.poly[(i + 1) % room.poly.length]
    const d = sub(b, a)
    const l = len(d)
    if (l < 0.25) continue
    const dir = unit(d)
    const n = { x: -dir.z, z: dir.x }
    const m = mid(a, b)
    const inward = inside(add(m, n, 0.1), room.poly) ? n : { x: -n.x, z: -n.z }
    const exterior = !rooms.some((r) => r.id !== room.id && inside(add(m, inward, -0.16), r.poly))
    out.push({ a, b, len: l, inward, exterior, dir })
  }
  return out
}

function project(p: Vec, e: Edge) {
  return dot(sub(p, e.a), e.dir)
}

function freeSpans(e: Edge, openings: Opening[], margin = 0.1): [number, number][] {
  const cuts: [number, number][] = []
  for (const o of openings) {
    if (distSeg(o.a, e.a, e.b) > 0.14 || distSeg(o.b, e.a, e.b) > 0.14) continue
    const t0 = project(o.a, e)
    const t1 = project(o.b, e)
    cuts.push([Math.min(t0, t1) - 0.02, Math.max(t0, t1) + 0.02])
  }
  let parts: [number, number][] = [[margin, e.len - margin]]
  for (const c of cuts) {
    parts = parts.flatMap(([s, t]) => {
      if (c[1] <= s || c[0] >= t) return [[s, t] as [number, number]]
      const r: [number, number][] = []
      if (c[0] > s + 0.05) r.push([s, c[0]])
      if (c[1] < t - 0.05) r.push([c[1], t])
      return r
    })
  }
  return parts.filter(([s, t]) => t - s > 0.35)
}

function canvasTex(draw: (ctx: CanvasRenderingContext2D, s: number) => void, size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return new THREE.Texture()
  draw(ctx, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

function woodTex() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = '#c6a27c'
    ctx.fillRect(0, 0, s, s)
    const plank = Math.floor(s / 6)
    for (let i = 0, y = 0; y < s; i++, y += plank) {
      const tone = 168 + ((i * 37) % 50)
      ctx.fillStyle = `rgb(${tone}, ${Math.floor(tone * 0.68)}, ${Math.floor(tone * 0.42)})`
      ctx.fillRect(0, y, s, plank - 2)
      ctx.strokeStyle = 'rgba(90, 48, 18, 0.13)'
      ctx.lineWidth = 1
      for (let g = 0; g < 5; g++) {
        const gy = y + 6 + g * (plank / 6)
        ctx.beginPath()
        ctx.moveTo(0, gy)
        ctx.bezierCurveTo(s * 0.3, gy + 2, s * 0.6, gy - 2, s, gy + 1)
        ctx.stroke()
      }
    }
  })
}

function tileTex(base: string, cells: number) {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = '#c8c2b8'
    ctx.fillRect(0, 0, s, s)
    const n = cells
    const g = 3
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const shade = 1 + ((i * 3 + j * 5) % 5) * 0.012
        ctx.fillStyle = base
        ctx.globalAlpha = shade > 1 ? 0.94 : 1
        const x = (s / n) * i + g / 2
        const y = (s / n) * j + g / 2
        ctx.fillRect(x, y, s / n - g, s / n - g)
        ctx.globalAlpha = 1
      }
    }
  })
}

function uvWorld(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  if (!uv) return
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i))
  uv.needsUpdate = true
}

function shapeOf(poly: Vec[]) {
  const shape = new THREE.Shape()
  shape.moveTo(poly[0].x, -poly[0].z)
  for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i].x, -poly[i].z)
  shape.closePath()
  return shape
}

export function buildApartment(planta: Planta, renderer: THREE.WebGLRenderer, shadowMap: number): Apartment {
  const geom = buildGeom(planta)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#f3f0ea')
  scene.fog = new THREE.Fog('#f3f0ea', 16, 34)

  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.22)
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  const texs: THREE.Texture[] = []
  let dead = false
  const take = <T extends THREE.BufferGeometry>(g: T) => {
    geos.push(g)
    return g
  }
  const takeM = <T extends THREE.Material>(m: T) => {
    mats.push(m)
    return m
  }
  const takeT = (t: THREE.Texture) => {
    texs.push(t)
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    return t
  }

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTex
  scene.environmentIntensity = 0.42
  texs.push(envTex)
  pmrem.dispose()

  const clipMat = (m: THREE.MeshStandardMaterial) => {
    m.clippingPlanes = [clip]
    m.clipShadows = true
    return m
  }

  const wallMat = takeM(clipMat(new THREE.MeshStandardMaterial({ color: '#f1ebe3', roughness: 0.93, metalness: 0 })))
  const trimMat = takeM(clipMat(new THREE.MeshStandardMaterial({ color: '#e7e0d4', roughness: 0.8, metalness: 0 })))
  const baseMat = takeM(new THREE.MeshStandardMaterial({ color: '#e4dcd0', roughness: 0.78 }))
  const glassMat = takeM(
    clipMat(
      new THREE.MeshStandardMaterial({
        color: '#d5e4ea',
        roughness: 0.06,
        metalness: 0,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        envMapIntensity: 1,
      }),
    ),
  )
  const doorMat = takeM(clipMat(new THREE.MeshStandardMaterial({ color: '#f7f4ef', roughness: 0.55, metalness: 0 })))
  const handleMat = takeM(new THREE.MeshStandardMaterial({ color: '#8d8f92', roughness: 0.35, metalness: 0.6 }))
  const woodMat = takeM(new THREE.MeshStandardMaterial({ color: '#8a623f', roughness: 0.62, metalness: 0 }))
  const woodLite = takeM(new THREE.MeshStandardMaterial({ color: '#b88858', roughness: 0.5, metalness: 0 }))
  const fabric = takeM(new THREE.MeshStandardMaterial({ color: '#6d655e', roughness: 0.92 }))
  const fabricLite = takeM(new THREE.MeshStandardMaterial({ color: '#d9d2c6', roughness: 0.9 }))
  const linen = takeM(new THREE.MeshStandardMaterial({ color: '#f3f0ea', roughness: 0.95 }))
  const throwMat = takeM(new THREE.MeshStandardMaterial({ color: '#2f4a3d', roughness: 0.9 }))
  const rugMat = takeM(new THREE.MeshStandardMaterial({ color: '#c6b39a', roughness: 1 }))
  const rugBed = takeM(new THREE.MeshStandardMaterial({ color: '#b7b1a8', roughness: 1 }))
  const stone = takeM(new THREE.MeshStandardMaterial({ color: '#3c4044', roughness: 0.38, metalness: 0.04 }))
  const cabMat = takeM(new THREE.MeshStandardMaterial({ color: '#f6f3ee', roughness: 0.7 }))
  const metal = takeM(new THREE.MeshStandardMaterial({ color: '#d5d7da', roughness: 0.32, metalness: 0.55 }))
  const dark = takeM(new THREE.MeshStandardMaterial({ color: '#2a2c2e', roughness: 0.5, metalness: 0.2 }))
  const white = takeM(new THREE.MeshStandardMaterial({ color: '#fbfaf7', roughness: 0.45 }))
  const leafMat = takeM(new THREE.MeshStandardMaterial({ color: '#3e6b52', roughness: 0.85 }))
  const potMat = takeM(new THREE.MeshStandardMaterial({ color: '#efeae3', roughness: 0.7 }))
  const lampMat = takeM(
    clipMat(new THREE.MeshStandardMaterial({ color: '#fff4e0', emissive: '#ffe0b0', emissiveIntensity: 0.7, roughness: 0.4 })),
  )
  const frameMat = takeM(clipMat(new THREE.MeshStandardMaterial({ color: '#6b5344', roughness: 0.6 })))
  const ceilMat = takeM(clipMat(new THREE.MeshStandardMaterial({ color: '#e8e2d8', roughness: 1, side: THREE.DoubleSide })))

  const wood = takeT(woodTex())
  const tileSocial = takeT(tileTex('#ddd8d0', 2))
  const tileWet = takeT(tileTex('#e7e3da', 4))
  const tileOut = takeT(tileTex('#d2d6cc', 2))
  const tileTech = takeT(tileTex('#c8c5bf', 2))

  const floorMat = (tipo: Room['tipo']) => {
    const map = tipo === 'intimo' ? wood : tipo === 'externo' ? tileOut : tipo === 'tecnico' ? tileTech : tipo === 'molhado' ? tileWet : tileSocial
    const rough = tipo === 'intimo' ? 0.72 : tipo === 'molhado' ? 0.35 : 0.48
    return takeM(
      new THREE.MeshStandardMaterial({
        map,
        color: '#ffffff',
        roughness: rough,
        metalness: 0,
        envMapIntensity: 0.28,
        side: THREE.DoubleSide,
      }),
    )
  }
  const floorMats = new Map<Room['tipo'], THREE.MeshStandardMaterial>()
  for (const t of ['social', 'intimo', 'molhado', 'externo', 'tecnico'] as const) floorMats.set(t, floorMat(t))

  const blocks: Block[] = []
  const cols: Collider[] = []
  const floors: THREE.Mesh[] = []
  const plaster: THREE.BufferGeometry[] = []
  const trims: THREE.BufferGeometry[] = []
  const glasses: THREE.BufferGeometry[] = []
  const bases: THREE.BufferGeometry[] = []

  const hemi = new THREE.HemisphereLight('#f6f1e8', '#c2b29c', 0.5)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight('#fff2e0', 3.05)
  sun.position.set(geom.span * 0.9, geom.span * 1.15, geom.span * 0.55)
  sun.target.position.set(geom.center.x, 0, geom.center.z)
  sun.castShadow = true
  sun.shadow.mapSize.set(shadowMap, shadowMap)
  sun.shadow.radius = 2.4
  sun.shadow.blurSamples = 6
  sun.shadow.bias = -0.00018
  sun.shadow.normalBias = 0.04
  const d = geom.span * 0.85
  const sc = sun.shadow.camera
  sc.left = -d
  sc.right = d
  sc.top = d
  sc.bottom = -d
  sc.near = 0.4
  sc.far = geom.span * 4
  scene.add(sun, sun.target)
  const fill = new THREE.DirectionalLight('#e4eef2', 0.55)
  fill.position.set(-geom.span, geom.span * 0.7, -geom.span * 0.4)
  scene.add(fill)

  const ground = new THREE.Mesh(
    take(new THREE.CircleGeometry(geom.span * 3.2, 48)),
    takeM(new THREE.MeshStandardMaterial({ color: '#e5e0d6', roughness: 1 })),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.receiveShadow = true
  scene.add(ground)

  const { bounds } = geom
  const plinth = new THREE.Mesh(
    take(new THREE.BoxGeometry(bounds.maxX - bounds.minX + 0.34, 0.08, bounds.maxZ - bounds.minZ + 0.34)),
    takeM(new THREE.MeshStandardMaterial({ color: '#2c2b29', roughness: 0.86 })),
  )
  plinth.position.set(geom.center.x, -0.01, geom.center.z)
  plinth.receiveShadow = true
  plinth.castShadow = true
  scene.add(plinth)

  const bake = (w: number, h: number, dpt: number, x: number, y: number, z: number, yaw: number, bucket: THREE.BufferGeometry[]) => {
    const g = new THREE.BoxGeometry(w, h, dpt)
    const m = new THREE.Matrix4().makeRotationY(yaw)
    m.setPosition(x, y, z)
    g.applyMatrix4(m)
    bucket.push(g)
  }

  for (const room of geom.rooms) {
    const shape = shapeOf(room.poly)
    const geo = take(new THREE.ExtrudeGeometry(shape, { depth: PISO, bevelEnabled: false }))
    geo.rotateX(-Math.PI / 2)
    uvWorld(geo)
    const mesh = new THREE.Mesh(geo, floorMats.get(room.tipo)!)
    mesh.receiveShadow = true
    mesh.userData.roomId = room.id
    mesh.name = room.id
    scene.add(mesh)
    floors.push(mesh)

    const ceil = take(new THREE.ShapeGeometry(shape))
    ceil.rotateX(-Math.PI / 2)
    ceil.translate(0, ALTURA - 0.012, 0)
    const cm = new THREE.Mesh(ceil, ceilMat)
    cm.receiveShadow = true
    scene.add(cm)

    if (room.area > 3.2 && room.clearance > 0.35) {
      const lamp = new THREE.Mesh(take(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 16)), lampMat)
      lamp.position.set(room.interior.x, ALTURA - 0.04, room.interior.z)
      scene.add(lamp)
    }
  }

  const point = new THREE.PointLight('#ffe6c4', 6, 7, 2)
  const estar = geom.rooms.find((r) => r.id === 'estar')
  if (estar) {
    point.position.set(estar.interior.x, 2.15, estar.interior.z)
    scene.add(point)
  }

  for (const piece of geom.walls) {
    const l = dist(piece.a, piece.b)
    const m = mid(piece.a, piece.b)
    const yaw = wallYaw(piece.a, piece.b)
    const solid = (y0: number, y1: number) => bake(l, y1 - y0, ESP, m.x, (y0 + y1) / 2, m.z, yaw, plaster)
    const glass = (y0: number, y1: number) => bake(l - 0.04, y1 - y0, 0.016, m.x, (y0 + y1) / 2, m.z, yaw, glasses)
    if (piece.kind === 'solid') solid(0, ALTURA)
    else if (piece.kind === 'window') {
      solid(0, 0.9)
      solid(2.18, ALTURA)
      glass(0.92, 2.16)
      frameAround(m, yaw, l, 0.9, 2.18)
    } else if (piece.kind === 'high') {
      solid(0, 1.22)
      solid(2.08, ALTURA)
      glass(1.24, 2.06)
      frameAround(m, yaw, l, 1.22, 2.08)
    } else {
      solid(0, 0.46)
      solid(2.22, ALTURA)
      glass(0.48, 2.2)
      frameAround(m, yaw, l, 0.46, 2.22)
    }
    cols.push({ ax: piece.a.x, az: piece.a.z, bx: piece.b.x, bz: piece.b.z })
    addBase(piece, l, m, yaw)
  }

  function frameAround(m: Vec, yaw: number, l: number, y0: number, y1: number) {
    const t = 0.045
    bake(l, t, 0.07, m.x, y0 + t / 2, m.z, yaw, trims)
    bake(l, t, 0.07, m.x, y1 - t / 2, m.z, yaw, trims)
    bake(t, y1 - y0, 0.07, m.x - Math.cos(-yaw) * (l / 2 - t / 2), (y0 + y1) / 2, m.z - Math.sin(-yaw) * (l / 2 - t / 2), yaw, trims)
    bake(t, y1 - y0, 0.07, m.x + Math.cos(-yaw) * (l / 2 - t / 2), (y0 + y1) / 2, m.z + Math.sin(-yaw) * (l / 2 - t / 2), yaw, trims)
  }

  function addBase(piece: WallPiece, l: number, m: Vec, yaw: number) {
    const put = (dir: Vec) => {
      const p = add(m, dir, ESP / 2 + 0.012)
      bake(l, 0.075, 0.018, p.x, PISO + 0.038, p.z, yaw, bases)
    }
    put(piece.inward)
    const other = { x: -piece.inward.x, z: -piece.inward.z }
    if (geom.rooms.some((r) => inside(add(m, other, 0.16), r.poly))) put(other)
  }

  for (const o of geom.openings) {
    const yaw = wallYaw(o.a, o.b)
    const head = o.tipo === 'vao' ? 2.34 : o.tipo === 'correr' ? 2.18 : 2.08
    bake(o.len + ESP, ALTURA - head, ESP, o.mid.x, (head + ALTURA) / 2, o.mid.z, yaw, plaster)
    if (o.tipo === 'porta') {
      bake(0.055, head, ESP + 0.03, o.a.x, head / 2, o.a.z, yaw, trims)
      bake(0.055, head, ESP + 0.03, o.b.x, head / 2, o.b.z, yaw, trims)
      const dir = { x: Math.cos(o.angle), z: Math.sin(o.angle) }
      const center = add(o.hinge, dir, o.width / 2)
      const leaf = new THREE.Mesh(take(new THREE.BoxGeometry(o.width, 2.04, 0.038)), doorMat)
      leaf.position.set(center.x, PISO + 1.02, center.z)
      leaf.rotation.y = -o.angle
      leaf.castShadow = true
      leaf.receiveShadow = true
      scene.add(leaf)
      const handle = new THREE.Mesh(take(new THREE.BoxGeometry(0.025, 0.12, 0.045)), handleMat)
      handle.position.set(o.width / 2 - 0.08, 0, 0.04)
      leaf.add(handle)
      const fp = footprint(center.x, center.z, o.width * 0.92, 0.06, -o.angle)
      blocks.push(toBlock(fp, -0.01))
    } else if (o.tipo === 'correr') {
      const dir = unit(sub(o.b, o.a))
      const pw = o.len * 0.46
      const park = (end: Vec, sign: number) => {
        const c = add(end, dir, sign * o.len * 0.2)
        bake(pw, 2.12, 0.02, c.x, PISO + 1.06, c.z, yaw, glasses)
      }
      park(o.a, -1)
      park(o.b, 1)
    }
  }

  const flush = (bucket: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
    if (!bucket.length) return
    const merged = mergeGeometries(bucket, false)
    bucket.forEach((g) => g.dispose())
    bucket.length = 0
    if (!merged) return
    geos.push(merged)
    const mesh = new THREE.Mesh(merged, mat)
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    scene.add(mesh)
  }
  flush(plaster, wallMat)
  flush(trims, trimMat)
  flush(glasses, glassMat, false)
  flush(bases, baseMat, false)

  const focus = new Map<string, Vec>()
  const openings = geom.openings

  const claim = (x: number, z: number, w: number, d: number, yaw: number, shrink = 0.02) => {
    const box = toBlock(footprint(x, z, w, d, yaw), shrink)
    if (blocks.some((b) => overlaps(b, box))) return null
    blocks.push(box)
    return box
  }

  const grp = (x: number, z: number, yaw: number) => {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = yaw
    scene.add(g)
    return g
  }

  const part = (parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(take(new THREE.BoxGeometry(w, h, d)), mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  const roomById = (id: string) => geom.rooms.find((r) => r.id === id)

  function placeBed(room: RoomPoly) {
    const edges = edgesOf(room, geom.rooms)
    const suite = room.id === 'suite'
    const wantW = suite ? 1.55 : 1.38
    const wantL = suite ? 2.02 : 1.9
    const doorMids = openings.filter((o) => o.rooms.includes(room.id)).map((o) => o.mid)
    let best: { e: Edge; span: [number, number]; bedW: number; bedL: number; score: number } | null = null
    for (const e of edges) {
      const spans = freeSpans(e, openings, 0.06).filter((s) => s[1] - s[0] >= 1.2)
      if (!spans.length) continue
      const span = spans.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0]
      const bedW = Math.min(wantW, span[1] - span[0] - 0.06)
      if (bedW < 1.15) continue
      const at = add(e.a, e.dir, (span[0] + span[1]) / 2)
      const avail = rayInside(add(at, e.inward, ESP / 2 + 0.04), e.inward, room.poly)
      const bedL = Math.min(wantL, avail - 0.58)
      if (bedL < 1.5) continue
      const doorD = doorMids.length ? Math.min(...doorMids.map((p) => dist(p, at))) : 2
      const score = (e.exterior ? 1.4 : 0) + doorD * 0.35 + bedL * 0.4 + bedW
      if (!best || score > best.score) best = { e, span, bedW, bedL, score }
    }
    if (!best) return
    const t = (best.span[0] + best.span[1]) / 2
    const yaw = yawOf(best.e.inward)
    const center = add(add(best.e.a, best.e.dir, t), best.e.inward, ESP / 2 + best.bedL / 2 + 0.04)
    if (!claim(center.x, center.z, best.bedW, best.bedL, yaw)) return
    const g = grp(center.x, center.z, yaw)
    const { bedW: w, bedL: l } = best
    part(g, w, 0.2, l, woodMat, 0, PISO + 0.1, 0)
    part(g, w - 0.05, 0.16, l - 0.02, linen, 0, PISO + 0.28, 0.01)
    part(g, w - 0.1, 0.07, l * 0.58, linen, 0, PISO + 0.38, l * 0.12)
    part(g, w * 0.72, 0.035, l * 0.28, throwMat, 0, PISO + 0.42, l * 0.02)
    part(g, w * 0.34, 0.09, 0.26, white, -w * 0.2, PISO + 0.42, -l / 2 + 0.28)
    part(g, w * 0.34, 0.09, 0.26, white, w * 0.2, PISO + 0.42, -l / 2 + 0.28)
    part(g, w, 0.58, 0.05, fabric, 0, PISO + 0.48, -l / 2 + 0.01)
    const rug = new THREE.Mesh(take(new THREE.BoxGeometry(w + 0.45, 0.012, l + 0.35)), rugBed)
    rug.position.set(0, PISO + 0.008, 0.08)
    rug.receiveShadow = true
    g.add(rug)
    focus.set(room.id, center)
    // criado-mudo se sobra parede
    const side = (best.span[1] - best.span[0] - w) / 2
    if (side > 0.42) {
      const r = rightOf(yaw)
      const back = add(center, fwdOf(yaw), -l / 2 + 0.22)
      for (const s of side > 0.9 ? [-1, 1] : [1]) {
        const p = add(back, r, s * (w / 2 + 0.24))
        if (!inside(p, room.poly)) continue
        if (!claim(p.x, p.z, 0.36, 0.32, yaw)) continue
        const n = grp(p.x, p.z, yaw)
        part(n, 0.36, 0.4, 0.32, woodMat, 0, PISO + 0.2, 0)
        const bulb = new THREE.Mesh(take(new THREE.SphereGeometry(0.035, 10, 8)), lampMat)
        bulb.position.set(0, PISO + 0.46, 0)
        n.add(bulb)
      }
    }
    // guarda-roupa numa outra parede
    for (const e of edges) {
      if (e === best.e) continue
      const spans = freeSpans(e, openings, 0.08).filter((s) => s[1] - s[0] >= 1.05)
      if (!spans.length) continue
      const span = spans[0]
      const ww = Math.min(1.7, span[1] - span[0] - 0.08)
      const avail = rayInside(add(add(e.a, e.dir, (span[0] + span[1]) / 2), e.inward, ESP / 2), e.inward, room.poly)
      if (avail < 0.7) continue
      const cyaw = yawOf(e.inward)
      const c = add(add(e.a, e.dir, (span[0] + span[1]) / 2), e.inward, ESP / 2 + 0.28)
      if (!inside(c, room.poly)) continue
      if (!claim(c.x, c.z, ww, 0.55, cyaw)) continue
      const wr = grp(c.x, c.z, cyaw)
      part(wr, ww, 1.05, 0.55, woodMat, 0, PISO + 0.525, 0)
      part(wr, 0.012, 0.92, 0.012, trimMat, 0, PISO + 0.52, 0.28)
      break
    }
    placeFrame(room, edges, best.e)
  }

  function placeLiving(room: RoomPoly) {
    const edges = edgesOf(room, geom.rooms)
    const varanda = roomById('varanda')
    const cozinha = roomById('cozinha')
    const far = varanda?.interior ?? cozinha?.interior ?? room.interior
    const bb = bbox(room.poly)
    let dining: Vec | null = null
    let bestScore = -Infinity
    for (let x = bb.minX + 0.3; x < bb.maxX; x += 0.28) {
      for (let z = bb.minZ + 0.3; z < bb.maxZ; z += 0.28) {
        const p = { x, z }
        if (!inside(p, room.poly)) continue
        const clear = edgeClear(p, room.poly)
        if (clear < 0.72) continue
        if (blocked(p.x, p.z, blocks, cols, [room.poly], [])) continue
        const score = dist(p, far) + clear * 0.3
        if (score > bestScore) {
          bestScore = score
          dining = p
        }
      }
    }
    if (dining && claim(dining.x, dining.z, 1.05, 1.05, 0)) {
      const g = grp(dining.x, dining.z, 0)
      const top = new THREE.Mesh(take(new THREE.CylinderGeometry(0.48, 0.48, 0.04, 24)), woodLite)
      top.position.y = PISO + 0.74
      top.castShadow = true
      top.receiveShadow = true
      g.add(top)
      const leg = new THREE.Mesh(take(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 10)), woodMat)
      leg.position.y = PISO + 0.37
      leg.castShadow = true
      g.add(leg)
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + Math.PI / 4
        const px = Math.cos(ang) * 0.78
        const pz = Math.sin(ang) * 0.78
        const world = { x: dining.x + px, z: dining.z + pz }
        if (!inside(world, room.poly) || edgeClear(world, room.poly) < 0.18) continue
        const face = Math.atan2(-px, -pz)
        const ch = grp(world.x, world.z, face)
        part(ch, 0.36, 0.05, 0.36, fabricLite, 0, PISO + 0.46, 0)
        part(ch, 0.36, 0.32, 0.05, fabricLite, 0, PISO + 0.64, -0.16)
        part(ch, 0.04, 0.44, 0.04, woodMat, 0, PISO + 0.22, 0)
      }
      focus.set(room.id, dining)
    }

    const sofaW = room.area > 13 ? 1.85 : 1.5
    let sofa: { e: Edge; t: number; score: number } | null = null
    for (const e of edges) {
      const spans = freeSpans(e, openings, 0.08).filter((s) => s[1] - s[0] >= sofaW)
      if (!spans.length) continue
      const span = spans[0]
      const avail = rayInside(add(mid(e.a, e.b), e.inward, ESP / 2 + 0.05), e.inward, room.poly)
      if (avail < 1.35) continue
      const target = varanda?.interior ?? room.interior
      let t = project(target, e)
      t = Math.max(span[0] + sofaW / 2, Math.min(span[1] - sofaW / 2, t))
      const at = add(e.a, e.dir, t)
      const score = -dist(at, target) + (e.exterior ? -0.4 : 0.6)
      if (!sofa || score > sofa.score) sofa = { e, t, score }
    }
    if (sofa) {
      const yaw = yawOf(sofa.e.inward)
      const depth = 0.78
      const c = add(add(sofa.e.a, sofa.e.dir, sofa.t), sofa.e.inward, ESP / 2 + depth / 2 + 0.03)
      if (inside(c, room.poly) && claim(c.x, c.z, sofaW, depth, yaw)) {
        const g = grp(c.x, c.z, yaw)
        part(g, sofaW - 0.16, 0.28, depth - 0.16, fabric, 0, PISO + 0.28, 0.04)
        part(g, sofaW - 0.16, 0.4, 0.14, fabric, 0, PISO + 0.5, -depth / 2 + 0.1)
        part(g, 0.12, 0.32, depth - 0.04, fabric, sofaW / 2 - 0.08, PISO + 0.34, 0.02)
        part(g, 0.12, 0.32, depth - 0.04, fabric, -sofaW / 2 + 0.08, PISO + 0.34, 0.02)
        part(g, 0.32, 0.1, 0.32, throwMat, 0.15, PISO + 0.46, 0.05)
        const tableD = 0.48
        const tp = add(c, sofa.e.inward, depth / 2 + tableD / 2 + 0.22)
        if (inside(tp, room.poly) && edgeClear(tp, room.poly) > 0.25 && claim(tp.x, tp.z, 0.7, tableD, yaw, 0)) {
          const tb = grp(tp.x, tp.z, yaw)
          part(tb, 0.7, 0.035, tableD, woodLite, 0, PISO + 0.38, 0)
          part(tb, 0.04, 0.34, 0.04, woodMat, 0, PISO + 0.18, 0)
        }
        const rugW = sofaW + 0.35
        const rugD = depth + 1.05
        const rug = new THREE.Mesh(take(new THREE.BoxGeometry(rugW, 0.012, rugD)), rugMat)
        rug.position.set(0, PISO + 0.006, depth * 0.35)
        rug.receiveShadow = true
        g.add(rug)
        const prev = focus.get(room.id)
        focus.set(room.id, prev ? lerp(prev, c, 0.45) : c)
      }
    }
    placePlant(room)
    placeFrame(room, edges)
  }

  function placeKitchen(room: RoomPoly) {
    const edges = edgesOf(room, geom.rooms)
    const bb = bbox(room.poly)
    const social = roomById('estar')?.interior ?? room.interior
    if (Math.min(bb.w, bb.d) < 1.12) {
      const alongX = bb.w >= bb.d
      const length = Math.max(bb.w, bb.d)
      const depth = Math.min(bb.w, bb.d) - 0.06
      const fridgeL = 0.62
      const counterL = Math.max(0.8, length - fridgeL - 0.08)
      const axis = alongX ? ({ x: 1, z: 0 } as Vec) : ({ x: 0, z: 1 } as Vec)
      const center = { x: (bb.minX + bb.maxX) / 2, z: (bb.minZ + bb.maxZ) / 2 }
      const towardSocial = dot(unit(sub(social, center)), axis)
      const sign = towardSocial >= 0 ? -1 : 1
      const fridgeC = add(center, axis, sign * (length / 2 - fridgeL / 2 - 0.03))
      const counterC = add(center, axis, -sign * (fridgeL / 2 + 0.02))
      const sizeYaw = alongX ? 0 : Math.PI / 2
      if (claim(fridgeC.x, fridgeC.z, alongX ? fridgeL : depth, alongX ? depth : fridgeL, 0)) {
        const g = grp(fridgeC.x, fridgeC.z, 0)
        part(g, alongX ? fridgeL : depth, 1.12, alongX ? depth : fridgeL, metal, 0, PISO + 0.56, 0)
      }
      if (claim(counterC.x, counterC.z, alongX ? counterL : depth, alongX ? depth : counterL, 0)) {
        counterRun(counterC, sizeYaw, alongX ? counterL : depth, alongX ? depth : counterL)
      }
      focus.set(room.id, center)
      placeFrame(room, edges)
      return
    }
    const ranked = edges
      .map((e) => ({ e, spans: freeSpans(e, openings, 0.05).filter((s) => s[1] - s[0] > 0.9) }))
      .filter((x) => x.spans.length)
      .sort((a, b) => b.spans[0][1] - b.spans[0][0] - (a.spans[0][1] - a.spans[0][0]))
    const pick = ranked[0]
    if (!pick) return
    const span = pick.spans[0]
    const e = pick.e
    const depth = Math.min(0.58, Math.min(bb.w, bb.d) - 0.7)
    if (depth < 0.42) return
    const spanLen = span[1] - span[0]
    const use = Math.min(spanLen - 0.05, spanLen)
    const t = (span[0] + span[1]) / 2
    const yaw = yawOf(e.inward)
    const c = add(add(e.a, e.dir, t), e.inward, ESP / 2 + depth / 2 + 0.02)
    if (!claim(c.x, c.z, use, depth, yaw)) return
    counterRun(c, yaw, use, depth)
    focus.set(room.id, c)
    placeFrame(room, edges, e)
  }

  function counterRun(c: Vec, yaw: number, w: number, d: number) {
    const g = grp(c.x, c.z, yaw)
    part(g, w, 0.84, d, cabMat, 0, PISO + 0.42, 0)
    part(g, w, 0.035, d, stone, 0, PISO + 0.855, 0)
    part(g, 0.32, 0.012, 0.28, dark, -w * 0.15, PISO + 0.88, 0)
    const sink = new THREE.Mesh(take(new THREE.CylinderGeometry(0.1, 0.09, 0.04, 14)), metal)
    sink.position.set(w * 0.22, PISO + 0.88, 0)
    sink.castShadow = true
    g.add(sink)
  }

  function placeBath(room: RoomPoly) {
    const edges = edgesOf(room, geom.rooms)
    const door = openings.find((o) => o.rooms.includes(room.id))
    const ranked = [...edges].sort((a, b) => {
      const da = door ? dist(mid(a.a, a.b), door.mid) : a.len
      const db = door ? dist(mid(b.a, b.b), door.mid) : b.len
      return db - da
    })
    const far = ranked.find((e) => freeSpans(e, openings, 0.05).some((s) => s[1] - s[0] > 0.5))
    if (far) {
      const span = freeSpans(far, openings, 0.05).sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0]
      const yaw = yawOf(far.inward)
      const t = (span[0] + span[1]) / 2
      const c = add(add(far.a, far.dir, t), far.inward, ESP / 2 + 0.28)
      if (inside(c, room.poly) && claim(c.x, c.z, 0.4, 0.55, yaw)) {
        const g = grp(c.x, c.z, yaw)
        part(g, 0.38, 0.2, 0.48, white, 0, PISO + 0.28, 0.04)
        part(g, 0.36, 0.28, 0.16, white, 0, PISO + 0.42, -0.18)
      }
    }
    const near = ranked[ranked.length - 1]
    if (near && near !== far) {
      const spans = freeSpans(near, openings, 0.08).filter((s) => s[1] - s[0] > 0.55)
      if (spans.length) {
        const yaw = yawOf(near.inward)
        const t = (spans[0][0] + spans[0][1]) / 2
        const c = add(add(near.a, near.dir, t), near.inward, ESP / 2 + 0.22)
        if (inside(c, room.poly) && claim(c.x, c.z, Math.min(0.7, spans[0][1] - spans[0][0]), 0.42, yaw)) {
          const g = grp(c.x, c.z, yaw)
          const w = Math.min(0.7, spans[0][1] - spans[0][0])
          part(g, w, 0.48, 0.4, cabMat, 0, PISO + 0.24, 0)
          part(g, w, 0.03, 0.42, white, 0, PISO + 0.5, 0)
        }
      }
    }
  }

  function placeService(room: RoomPoly) {
    const edges = edgesOf(room, geom.rooms)
    const e = [...edges].sort((a, b) => b.len - a.len)[0]
    if (!e) return
    const spans = freeSpans(e, openings, 0.05).filter((s) => s[1] - s[0] > 0.6)
    if (!spans.length) return
    const span = spans[0]
    const yaw = yawOf(e.inward)
    const depth = 0.5
    const avail = rayInside(add(mid(e.a, e.b), e.inward, 0.08), e.inward, room.poly)
    if (avail < 0.55) return
    const w = Math.min(span[1] - span[0], room.clearance > 0.4 ? span[1] - span[0] : 1.1)
    const t = span[0] + w / 2
    const c = add(add(e.a, e.dir, t), e.inward, ESP / 2 + Math.min(depth, avail - 0.08) / 2)
    const d = Math.min(depth, avail - 0.08)
    if (d < 0.35 || !claim(c.x, c.z, w, d, yaw)) return
    const g = grp(c.x, c.z, yaw)
    part(g, Math.max(0.4, w - 0.62), 0.84, d, cabMat, -0.28, PISO + 0.42, 0)
    part(g, Math.max(0.4, w - 0.62), 0.03, d, stone, -0.28, PISO + 0.85, 0)
    part(g, 0.55, 0.7, Math.min(0.55, d), metal, w / 2 - 0.32, PISO + 0.35, 0)
  }

  function placeTech(room: RoomPoly) {
    const bb = bbox(room.poly)
    const c = room.interior
    const alongX = bb.w >= bb.d
    const w = Math.min(0.7, (alongX ? bb.w : bb.d) - 0.12)
    const d = Math.min(0.4, (alongX ? bb.d : bb.w) - 0.1)
    if (w < 0.3 || d < 0.2) return
    if (!claim(c.x, c.z, alongX ? w : d, alongX ? d : w, 0)) return
    const g = grp(c.x, c.z, 0)
    part(g, alongX ? w : d, 0.55, alongX ? d : w, metal, 0, PISO + 0.28, 0)
  }

  function placeBalcony(room: RoomPoly) {
    const edges = edgesOf(room, geom.rooms)
    const estarP = roomById('estar')?.interior ?? room.interior
    const outer = edges
      .filter((e) => e.exterior && e.len > 0.7)
      .sort((a, b) => dist(mid(a.a, a.b), estarP) - dist(mid(b.a, b.b), estarP))[0]
    const bb = bbox(room.poly)
    const deep = Math.min(bb.w, bb.d)
    if (deep >= 1.65 && room.area >= 4.2) {
      let best: Vec | null = null
      let score = -Infinity
      for (let x = bb.minX + 0.35; x < bb.maxX; x += 0.25) {
        for (let z = bb.minZ + 0.35; z < bb.maxZ; z += 0.25) {
          const p = { x, z }
          if (!inside(p, room.poly) || edgeClear(p, room.poly) < 0.45) continue
          if (blocked(p.x, p.z, blocks, cols, [room.poly], [])) continue
          const s = dist(p, estarP)
          if (s > score) {
            score = s
            best = p
          }
        }
      }
      if (best && claim(best.x, best.z, 0.7, 0.7, 0)) {
        const g = grp(best.x, best.z, 0)
        const top = new THREE.Mesh(take(new THREE.CylinderGeometry(0.32, 0.32, 0.035, 18)), woodLite)
        top.position.y = PISO + 0.52
        top.castShadow = true
        g.add(top)
        const leg = new THREE.Mesh(take(new THREE.CylinderGeometry(0.03, 0.04, 0.48, 8)), woodMat)
        leg.position.y = PISO + 0.26
        g.add(leg)
        focus.set(room.id, best)
      }
    } else if (outer) {
      const spans = freeSpans(outer, openings, 0.1).filter((s) => s[1] - s[0] > 0.7)
      if (spans.length) {
        const w = Math.min(1.15, spans[0][1] - spans[0][0])
        const yaw = yawOf(outer.inward)
        const c = add(add(outer.a, outer.dir, (spans[0][0] + spans[0][1]) / 2), outer.inward, ESP / 2 + 0.22)
        if (inside(c, room.poly) && claim(c.x, c.z, w, 0.42, yaw)) {
          const g = grp(c.x, c.z, yaw)
          part(g, w, 0.4, 0.42, woodLite, 0, PISO + 0.2, 0)
          focus.set(room.id, c)
        }
      }
    }
    placePlant(room)
    placeFrame(room, edges)
  }

  function placePlant(room: RoomPoly) {
    let best: Vec | null = null
    let bestD = 0
    for (let i = 0; i < room.poly.length; i++) {
      const p = room.poly[i]
      const prev = room.poly[(i + room.poly.length - 1) % room.poly.length]
      const next = room.poly[(i + 1) % room.poly.length]
      const a = unit(sub(prev, p))
      const b = unit(sub(next, p))
      const bis = unit(add(a, b))
      let q = add(p, bis, 0.32)
      if (!inside(q, room.poly)) q = add(p, bis, -0.32)
      if (!inside(q, room.poly) || edgeClear(q, room.poly) < 0.12) continue
      if (blocked(q.x, q.z, blocks, cols, [room.poly], [])) continue
      const d = dist(q, room.interior)
      if (d > bestD) {
        bestD = d
        best = q
      }
    }
    if (!best || !claim(best.x, best.z, 0.28, 0.28, 0)) return
    const pot = new THREE.Mesh(take(new THREE.CylinderGeometry(0.1, 0.08, 0.14, 10)), potMat)
    pot.position.set(best.x, PISO + 0.07, best.z)
    pot.castShadow = true
    scene.add(pot)
    const leaf = new THREE.Mesh(take(new THREE.SphereGeometry(0.16, 10, 8)), leafMat)
    leaf.position.set(best.x, PISO + 0.28, best.z)
    leaf.scale.y = 1.2
    leaf.castShadow = true
    scene.add(leaf)
  }

  const loader = new THREE.TextureLoader()
  function placeFrame(room: RoomPoly, edges: Edge[], avoid?: Edge) {
    if (!room.foto) return
    const cands = edges.filter((e) => e !== avoid && e.len > 1).sort((a, b) => b.len - a.len)
    for (const e of cands) {
      const spans = freeSpans(e, openings, 0.25).filter((s) => s[1] - s[0] > 0.95)
      if (!spans.length) continue
      const span = spans[0]
      const yaw = yawOf(e.inward)
      const c = add(add(e.a, e.dir, (span[0] + span[1]) / 2), e.inward, ESP / 2 + 0.02)
      if (!inside(add(c, e.inward, 0.05), room.poly)) continue
      const g = grp(c.x, c.z, yaw)
      part(g, 0.92, 0.6, 0.03, frameMat, 0, 1.42, 0)
      const photoMat = takeM(
        clipMat(new THREE.MeshStandardMaterial({ color: '#ddd', roughness: 0.65 })),
      )
      const photo = new THREE.Mesh(take(new THREE.PlaneGeometry(0.82, 0.5)), photoMat)
      photo.position.set(0, 1.42, 0.02)
      g.add(photo)
      const url = room.foto
      loader.load(url, (tex) => {
        if (dead) {
          tex.dispose()
          return
        }
        tex.colorSpace = THREE.SRGBColorSpace
        texs.push(tex)
        photoMat.map = tex
        photoMat.color.set('#ffffff')
        photoMat.needsUpdate = true
      })
      return
    }
  }

  function edgeClear(p: Vec, poly: Vec[]) {
    let d = Infinity
    for (let i = 0; i < poly.length; i++) d = Math.min(d, distSeg(p, poly[i], poly[(i + 1) % poly.length]))
    return d
  }

  for (const room of geom.rooms) {
    if (room.tipo === 'intimo') placeBed(room)
    else if (room.id === 'estar') placeLiving(room)
    else if (room.id === 'cozinha') placeKitchen(room)
    else if (room.tipo === 'molhado' && room.id !== 'cozinha') {
      if (room.id === 'servico') placeService(room)
      else placeBath(room)
    } else if (room.tipo === 'externo') placeBalcony(room)
    else if (room.tipo === 'tecnico') placeTech(room)
  }

  // banquetas na bancada aberta entre estar e cozinha
  for (const o of openings) {
    if (o.tipo !== 'vao' || o.len < 1.7) continue
    const hosts = o.rooms.map((id) => roomById(id)).filter((r): r is RoomPoly => !!r)
    const bigger = [...hosts].sort((a, b) => b.area - a.area)[0]
    if (!bigger) continue
    const inward = unit(sub(bigger.interior, o.mid))
    const dir = unit(sub(o.b, o.a))
    const n = o.len > 2.5 ? 3 : 2
    for (let i = 1; i <= n; i++) {
      const p = add(add(o.a, dir, (o.len * i) / (n + 1)), inward, 0.36)
      if (!inside(p, bigger.poly) || edgeClear(p, bigger.poly) < 0.15) continue
      if (!claim(p.x, p.z, 0.32, 0.32, 0)) continue
      const seat = new THREE.Mesh(take(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 14)), fabricLite)
      seat.position.set(p.x, PISO + 0.64, p.z)
      seat.castShadow = true
      scene.add(seat)
      const leg = new THREE.Mesh(take(new THREE.CylinderGeometry(0.04, 0.045, 0.6, 8)), metal)
      leg.position.set(p.x, PISO + 0.32, p.z)
      leg.castShadow = true
      scene.add(leg)
    }
  }

  const thresholds = openings.map((o) => o.mid)
  const polys = geom.rooms.map((r) => r.poly)

  const tour: TourStop[] = []
  const ordem = ORDEM[planta.id] ?? geom.rooms.map((r) => r.id)
  for (const id of ordem) {
    const room = roomById(id)
    if (!room) continue
    const lookAt = focus.get(id) ?? room.interior
    let stand: Vec | null = room.clearance >= 0.45 ? pickStand(room, lookAt) : null
    let look = lookAt
    if (!stand) {
      const ext = standOutside(room)
      if (ext) {
        stand = ext.eye
        look = ext.look
      }
    }
    if (!stand) {
      const visto = olharDeFora(room)
      if (!visto) continue
      stand = visto.eye
      look = visto.look
    }
    tour.push({
      roomId: room.id,
      nome: room.nome,
      area: room.area,
      foto: room.foto,
      eye: new THREE.Vector3(stand.x, OLHO, stand.z),
      look: new THREE.Vector3(look.x, 1.05, look.z),
    })
  }

  function clearOfBlocks(p: Vec, min: number) {
    for (const b of blocks) {
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX))
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ))
      if (Math.hypot(p.x - cx, p.z - cz) < min) return false
    }
    return true
  }

  function pickStand(room: RoomPoly, lookAt: Vec) {
    const bb = bbox(room.poly)
    let best: Vec | null = null
    let score = -Infinity
    for (let x = bb.minX + 0.2; x < bb.maxX; x += 0.26) {
      for (let z = bb.minZ + 0.2; z < bb.maxZ; z += 0.26) {
        const p = { x, z }
        if (!inside(p, room.poly)) continue
        if (edgeClear(p, room.poly) < 0.3) continue
        if (!clearOfBlocks(p, 0.58)) continue
        if (blocked(p.x, p.z, blocks, cols, polys, thresholds)) continue
        if (!sees(p, lookAt, room.poly)) continue
        const d = dist(p, lookAt)
        if (d < 0.9) continue
        const s = -Math.abs(d - 1.85) + edgeClear(p, room.poly) * 0.45
        if (s > score) {
          score = s
          best = p
        }
      }
    }
    return best
  }

  function sees(a: Vec, b: Vec, poly: Vec[]) {
    for (let i = 1; i <= 5; i++) if (!inside(lerp(a, b, i / 6), poly)) return false
    return true
  }

  function olharDeFora(room: RoomPoly): { eye: Vec; look: Vec } | null {
    let vizinho: RoomPoly | null = null
    let melhor = 0
    for (const other of geom.rooms) {
      if (other.id === room.id) continue
      for (let i = 0; i < room.poly.length; i++) {
        const a = room.poly[i]
        const b = room.poly[(i + 1) % room.poly.length]
        const d = sub(b, a)
        const l = len(d)
        if (l < 0.4) continue
        const u = { x: d.x / l, z: d.z / l }
        const n = { x: -u.z, z: u.x }
        const m = mid(a, b)
        const fora = inside(add(m, n, 0.18), other.poly) || inside(add(m, n, -0.18), other.poly)
        if (fora && l > melhor) {
          vizinho = other
          melhor = l
        }
      }
    }
    if (!vizinho) return null
    const dir = unit(sub(room.interior, vizinho.interior))
    let eye = vizinho.interior
    for (const passo of [0.35, 0.7, 1.05]) {
      const p = add(vizinho.interior, dir, passo)
      if (!inside(p, vizinho.poly) || edgeClear(p, vizinho.poly) < 0.22) continue
      if (blocked(p.x, p.z, blocks, cols, polys, thresholds)) continue
      eye = p
    }
    return { eye, look: focus.get(room.id) ?? room.interior }
  }

  function standOutside(room: RoomPoly) {
    const opens = openings
      .filter((o) => o.rooms.includes(room.id))
      .sort((a, b) => (b.tipo === 'vao' ? 2 : b.tipo === 'correr' ? 1 : 0) - (a.tipo === 'vao' ? 2 : a.tipo === 'correr' ? 1 : 0))
    for (const o of opens) {
      const other = o.rooms.map((id) => roomById(id)).find((r) => r && r.id !== room.id)
      const dir = other ? unit(sub(other.interior, o.mid)) : unit(sub(o.mid, room.interior))
      for (const step of [1.15, 0.8, 1.45, 0.55]) {
        const p = add(o.mid, dir, step)
        const host = geom.rooms.find((r) => inside(p, r.poly))
        if (!host || edgeClear(p, host.poly) < 0.26) continue
        if (blocked(p.x, p.z, blocks, cols, polys, thresholds)) continue
        return { eye: p, look: focus.get(room.id) ?? room.interior }
      }
    }
    return null
  }

  let spawn = geom.inicio
  if (blocked(spawn.x, spawn.z, blocks, cols, polys, thresholds)) {
    const fromTour = tour[0]?.eye
    if (fromTour && !blocked(fromTour.x, fromTour.z, blocks, cols, polys, thresholds)) spawn = { x: fromTour.x, z: fromTour.z }
    else {
      const social = roomById('estar')
      if (social) spawn = social.interior
    }
  }

  const distCam = geom.span * 0.95
  const doll = {
    pos: new THREE.Vector3(geom.center.x + geom.span * 0.02, geom.span * 0.9, geom.center.z + distCam * 0.82),
    target: new THREE.Vector3(geom.center.x, 0.25, geom.center.z),
  }

  return {
    scene,
    floors,
    rooms: geom.rooms,
    blocks,
    cols,
    thresholds,
    geom,
    tour,
    spawn,
    doll,
    clip,
    dispose() {
      dead = true
      for (const g of geos) g.dispose()
      for (const m of mats) m.dispose()
      for (const t of texs) t.dispose()
    },
  }
}
