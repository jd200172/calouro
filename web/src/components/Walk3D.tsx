import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { escala, type Planta, type Pt } from '../data/edimburgo'

const ALTURA = 2.6
const ESPESSURA = 0.12
const OLHO = 1.6
const RAIO = 0.22
const TOL = 4 // px para considerar dois segmentos na mesma linha

type Seg = { a: Pt; b: Pt }
type Intervalo = [number, number]

// Une as arestas de todos os cômodos por linha (horizontal/vertical) e subtrai os vãos.
function paredes(pl: Planta): Seg[] {
  const linhas: { h: boolean; c: number; iv: Intervalo[] }[] = []
  const linha = (h: boolean, c: number) => {
    let l = linhas.find((q) => q.h === h && Math.abs(q.c - c) <= TOL)
    if (!l) linhas.push((l = { h, c, iv: [] }))
    return l
  }
  for (const r of pl.rooms) {
    for (let i = 0; i < r.poly.length; i++) {
      const p = r.poly[i]
      const q = r.poly[(i + 1) % r.poly.length]
      if (p[1] === q[1]) linha(true, p[1]).iv.push([Math.min(p[0], q[0]), Math.max(p[0], q[0])])
      else if (p[0] === q[0]) linha(false, p[0]).iv.push([Math.min(p[1], q[1]), Math.max(p[1], q[1])])
    }
  }
  const out: Seg[] = []
  for (const l of linhas) {
    // união
    const iv = l.iv.sort((a, b) => a[0] - b[0])
    const uni: Intervalo[] = []
    for (const v of iv) {
      const u = uni[uni.length - 1]
      if (u && v[0] <= u[1] + TOL) u[1] = Math.max(u[1], v[1])
      else uni.push([...v])
    }
    // subtração dos vãos
    const vaos = pl.doors
      .filter((d) => (l.h ? Math.abs(d.a[1] - l.c) <= TOL && Math.abs(d.b[1] - l.c) <= TOL : Math.abs(d.a[0] - l.c) <= TOL && Math.abs(d.b[0] - l.c) <= TOL))
      .map((d): Intervalo => (l.h ? [Math.min(d.a[0], d.b[0]), Math.max(d.a[0], d.b[0])] : [Math.min(d.a[1], d.b[1]), Math.max(d.a[1], d.b[1])]))
    for (const u of uni) {
      let partes: Intervalo[] = [u]
      for (const v of vaos) {
        partes = partes.flatMap(([s, e]): Intervalo[] => {
          if (v[1] <= s || v[0] >= e) return [[s, e]]
          const r: Intervalo[] = []
          if (v[0] > s) r.push([s, v[0]])
          if (v[1] < e) r.push([v[1], e])
          return r
        })
      }
      for (const [s, e] of partes) {
        if (e - s < 2) continue
        out.push(l.h ? { a: [s, l.c], b: [e, l.c] } : { a: [l.c, s], b: [l.c, e] })
      }
    }
  }
  return out
}

function dentro(p: Pt, poly: Pt[]) {
  let d = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) d = !d
  }
  return d
}

function distSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax
  const dz = bz - az
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

export function Walk3D({ planta }: { planta: Planta }) {
  const host = useRef<HTMLDivElement>(null)
  const [modo, setModo] = useState<'maquete' | 'caminhar'>('maquete')
  const [comodo, setComodo] = useState('')
  const [travado, setTravado] = useState(false)
  const api = useRef<{ entrar: () => void } | null>(null)

  useEffect(() => {
    const el = host.current!
    const s = escala(planta)
    const xs = planta.rooms.flatMap((r) => r.poly.map((p) => p[0]))
    const ys = planta.rooms.flatMap((r) => r.poly.map((p) => p[1]))
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const M = (p: Pt) => new THREE.Vector2((p[0] - cx) * s, (p[1] - cy) * s)
    const P = (x: number, z: number): Pt => [x / s + cx, z / s + cy]

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#eef0ec')
    const camera = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.05, 200)

    scene.add(new THREE.HemisphereLight('#ffffff', '#b8b2a6', 2.2))
    const sol = new THREE.DirectionalLight('#fff6e8', 1.6)
    sol.position.set(6, 12, 4)
    sol.castShadow = true
    sol.shadow.mapSize.set(2048, 2048)
    Object.assign(sol.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 })
    scene.add(sol)

    // Piso: a própria planta humanizada como textura
    const tex = new THREE.TextureLoader().load(planta.imagem)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const piso = new THREE.Mesh(
      new THREE.PlaneGeometry(800 * s, 600 * s),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
    )
    piso.rotation.x = -Math.PI / 2
    piso.position.set((400 - cx) * s, 0, (300 - cy) * s)
    piso.receiveShadow = true
    scene.add(piso)

    // Paredes
    const segs = paredes(planta).map((w) => ({ a: M(w.a), b: M(w.b) }))
    const matParede = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.95 })
    const grupo = new THREE.Group()
    for (const { a, b } of segs) {
      const len = a.distanceTo(b)
      const g = new THREE.BoxGeometry(len + ESPESSURA, ALTURA, ESPESSURA)
      const m = new THREE.Mesh(g, matParede)
      m.position.set((a.x + b.x) / 2, ALTURA / 2, (a.y + b.y) / 2)
      m.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x)
      m.castShadow = m.receiveShadow = true
      grupo.add(m)
    }
    scene.add(grupo)

    // Controles
    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.maxPolarAngle = Math.PI / 2.2
    orbit.target.set(0, 0, 0)
    const look = new PointerLockControls(camera, renderer.domElement)
    look.addEventListener('lock', () => setTravado(true))
    look.addEventListener('unlock', () => setTravado(false))

    const ini = M(planta.inicio)
    const irMaquete = () => {
      camera.position.set(0, 6.5, 5.5)
      orbit.target.set(0, 0, 0)
      orbit.enabled = true
      grupo.children.forEach((c) => ((c as THREE.Mesh).scale.y = 1))
    }
    const irCaminhar = () => {
      orbit.enabled = false
      camera.position.set(ini.x, OLHO, ini.y)
      camera.lookAt(ini.x, OLHO * 0.85, ini.y + 1)
    }
    if (modo === 'maquete') irMaquete()
    else irCaminhar()
    api.current = { entrar: () => look.lock() }
    if (import.meta.env.DEV) Object.assign(window, { __walk: { camera, segs, P } })

    const teclas = new Set<string>()
    const kd = (e: KeyboardEvent) => teclas.add(e.code)
    const ku = (e: KeyboardEvent) => teclas.delete(e.code)
    addEventListener('keydown', kd)
    addEventListener('keyup', ku)

    const livre = (x: number, z: number) => segs.every(({ a, b }) => distSeg(x, z, a.x, a.y, b.x, b.y) > RAIO + ESPESSURA / 2)

    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
    })
    ro.observe(el)

    const relogio = new THREE.Clock()
    let ultimo = ''
    renderer.setAnimationLoop(() => {
      const dt = Math.min(relogio.getDelta(), 0.05)
      if (modo === 'maquete') orbit.update()
      else {
        const v = 1.6 * dt
        const frente = new THREE.Vector3()
        camera.getWorldDirection(frente)
        frente.y = 0
        frente.normalize()
        const lado = new THREE.Vector3().crossVectors(frente, camera.up)
        const d = new THREE.Vector3()
        if (teclas.has('KeyW') || teclas.has('ArrowUp')) d.add(frente)
        if (teclas.has('KeyS') || teclas.has('ArrowDown')) d.sub(frente)
        if (teclas.has('KeyD') || teclas.has('ArrowRight')) d.add(lado)
        if (teclas.has('KeyA') || teclas.has('ArrowLeft')) d.sub(lado)
        if (d.lengthSq() > 0) {
          d.normalize().multiplyScalar(v)
          const p = camera.position
          if (livre(p.x + d.x, p.z)) p.x += d.x
          if (livre(p.x, p.z + d.z)) p.z += d.z
        }
        const aqui = P(camera.position.x, camera.position.z)
        const r = planta.rooms.find((q) => dentro(aqui, q.poly))
        const nome = r ? `${r.nome} · ${r.area.toFixed(2).replace('.', ',')} m²` : ''
        if (nome !== ultimo) setComodo((ultimo = nome))
      }
      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      removeEventListener('keydown', kd)
      removeEventListener('keyup', ku)
      ro.disconnect()
      look.disconnect()
      orbit.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [planta, modo])

  return (
    <div className="walk">
      <div ref={host} className="walk-canvas" />
      <div className="seg walk-seg">
        <button className={modo === 'maquete' ? 'on' : ''} onClick={() => setModo('maquete')}>
          Maquete
        </button>
        <button className={modo === 'caminhar' ? 'on' : ''} onClick={() => setModo('caminhar')}>
          Caminhar
        </button>
      </div>
      {modo === 'caminhar' && !travado && (
        <button className="walk-start" onClick={() => api.current?.entrar()}>
          Clique para entrar
          <small>W A S D ou setas para andar · mouse para olhar · Esc para sair</small>
        </button>
      )}
      {modo === 'caminhar' && comodo && <div className="walk-hud">{comodo}</div>}
      {modo === 'maquete' && <div className="walk-hint">Arraste para girar · role para aproximar</div>}
    </div>
  )
}
