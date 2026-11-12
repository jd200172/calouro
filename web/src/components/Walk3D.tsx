import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Planta } from '../data/edimburgo'
import { buildApartment, type Apartment, type TourStop } from '../walk/buildApartment'
import { OLHO, blocked, inside, toPx, type Vec } from '../walk/geom'

const DOLL_CLIP = 1.22
const WALK_CLIP = 5
const DOLL_FOV = 46
const WALK_FOV = 62

type Modo = 'maquete' | 'caminhar' | 'visita'

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const fmt = (n: number) => n.toFixed(2).replace('.', ',')

export function Walk3D({ planta }: { planta: Planta }) {
  const host = useRef<HTMLDivElement>(null)
  const mini = useRef<HTMLCanvasElement>(null)
  const labels = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLSpanElement>(null)
  const knob = useRef<HTMLSpanElement>(null)
  const joy = useRef({ x: 0, y: 0 })
  const [modo, setModo] = useState<Modo>('maquete')
  const [hud, setHud] = useState('')
  const [poi, setPoi] = useState<{ nome: string; foto: string } | null>(null)
  const [light, setLight] = useState<string | null>(null)
  const [coarse, setCoarse] = useState(false)
  const api = useRef<{
    maquete: () => void
    caminhar: () => void
    visita: () => void
    irPara: (px: number, py: number) => void
    assumir: () => void
  } | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const apply = () => setCoarse(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const coarsePtr = window.matchMedia('(pointer: coarse)').matches
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePtr ? 1.35 : 1.75))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.98
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.localClippingEnabled = true
    renderer.domElement.style.touchAction = 'none'
    el.appendChild(renderer.domElement)

    const shadowMap = coarsePtr || window.innerWidth < 900 ? 1024 : 2048
    const apt = buildApartment(planta, renderer, shadowMap)
    const camera = new THREE.PerspectiveCamera(DOLL_FOV, el.clientWidth / Math.max(1, el.clientHeight), 0.08, 80)
    camera.position.copy(apt.doll.pos)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.08
    orbit.target.copy(apt.doll.target)
    orbit.maxPolarAngle = Math.PI / 2.04
    orbit.minPolarAngle = 0.18
    orbit.minDistance = 1.4
    orbit.maxDistance = apt.geom.span * 2.6
    orbit.update()

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const euler = new THREE.Euler(0, 0, 0, 'YXZ')
    const pivot = new THREE.Object3D()
    let mode: 'doll' | 'walk' | 'tour' = 'doll'
    let yaw = 0
    let pitch = -0.08
    const keys = new Set<string>()
    const vel = new THREE.Vector3()
    const wish = new THREE.Vector3()
    let hudText = ''
    let poiFoto = ''
    let roomNow = ''
    let pending = ''
    let pendingAt = 0

    const quatLook = (pos: THREE.Vector3, target: THREE.Vector3) => {
      pivot.position.copy(pos)
      pivot.up.set(0, 1, 0)
      pivot.lookAt(target)
      return pivot.quaternion.clone()
    }
    const grab = () => {
      euler.setFromQuaternion(camera.quaternion, 'YXZ')
      yaw = euler.y
      pitch = euler.x
    }

    type Tween = {
      t: number
      dur: number
      from: THREE.Vector3
      to: THREE.Vector3
      fromQ: THREE.Quaternion
      toQ: THREE.Quaternion
      fromFov: number
      toFov: number
      fromClip: number
      toClip: number
      fromTarget: THREE.Vector3
      toTarget: THREE.Vector3
      done: 'doll' | 'walk'
    }
    let tween: Tween | null = null

    const startTween = (
      pos: THREE.Vector3,
      target: THREE.Vector3,
      fov: number,
      clipH: number,
      done: 'doll' | 'walk',
      dur = 0.95,
    ) => {
      orbit.enabled = false
      tween = {
        t: 0,
        dur: reduce ? 0.01 : dur,
        from: camera.position.clone(),
        to: pos.clone(),
        fromQ: camera.quaternion.clone(),
        toQ: quatLook(pos, target),
        fromFov: camera.fov,
        toFov: fov,
        fromClip: apt.clip.constant,
        toClip: clipH,
        fromTarget: orbit.target.clone(),
        toTarget: target.clone(),
        done,
      }
    }

    const finishTween = () => {
      if (!tween) return
      const tw = tween
      tween = null
      camera.position.copy(tw.to)
      camera.quaternion.copy(tw.toQ)
      camera.fov = tw.toFov
      camera.updateProjectionMatrix()
      apt.clip.constant = tw.toClip
      orbit.target.copy(tw.toTarget)
      if (tw.done === 'doll') {
        mode = 'doll'
        orbit.enabled = true
        orbit.update()
        setModo('maquete')
      } else {
        mode = 'walk'
        grab()
        camera.position.y = OLHO
        orbit.enabled = false
        setModo('caminhar')
      }
    }

    type Move = {
      kind: 'move'
      from: THREE.Vector3
      to: THREE.Vector3
      look: THREE.Vector3
      t: number
      dur: number
      fly: boolean
      index: number
      settle: boolean
    }
    type Hold = { kind: 'hold'; index: number; t: number; dur: number; pos: THREE.Vector3; look: THREE.Vector3 }
    type Rise = { kind: 'rise'; t: number; dur: number; from: THREE.Vector3; fromQ: THREE.Quaternion }
    let phase: Move | Hold | Rise | null = null

    const polys = apt.rooms.map((r) => r.poly)
    const roomAt = (p: Vec) => apt.rooms.find((r) => inside(p, r.poly))
    const segOk = (a: Vec, b: Vec) => {
      for (let i = 1; i < 8; i++) {
        const t = i / 8
        const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
        if (roomAt(p)) continue
        if (apt.thresholds.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 0.45)) continue
        return false
      }
      return true
    }
    const routeTo = (from: Vec, to: Vec) => {
      const a = roomAt(from)
      const b = roomAt(to)
      if (!a || !b || a.id === b.id || segOk(from, to)) return [to]
      const adj = new Map<string, { id: string; via: Vec }[]>()
      for (const o of apt.geom.openings) {
        if (o.rooms.length < 2) continue
        const [i, j] = o.rooms
        const push = (fromId: string, toId: string) => {
          const list = adj.get(fromId) ?? []
          list.push({ id: toId, via: o.mid })
          adj.set(fromId, list)
        }
        push(i, j)
        push(j, i)
      }
      const prev = new Map<string, { id: string; via: Vec } | null>()
      const q = [a.id]
      prev.set(a.id, null)
      for (let qi = 0; qi < q.length; qi++) {
        const cur = q[qi]
        if (cur === b.id) break
        for (const n of adj.get(cur) ?? []) {
          if (prev.has(n.id)) continue
          prev.set(n.id, { id: cur, via: n.via })
          q.push(n.id)
        }
      }
      if (!prev.has(b.id)) return [to]
      const steps: { via: Vec; into: string }[] = []
      let cur = b.id
      while (cur !== a.id) {
        const step = prev.get(cur)
        if (!step) break
        steps.push({ via: step.via, into: cur })
        cur = step.id
      }
      steps.reverse()
      const pts: Vec[] = []
      for (const step of steps) {
        const host = apt.rooms.find((r) => r.id === step.into) ?? b
        const dirx = host.interior.x - step.via.x
        const dirz = host.interior.z - step.via.z
        const dl = Math.hypot(dirx, dirz) || 1
        pts.push({ x: step.via.x + (dirx / dl) * 0.36, z: step.via.z + (dirz / dl) * 0.36 })
      }
      pts.push(to)
      return pts
    }

    let legs: { to: THREE.Vector3; look: THREE.Vector3; fly: boolean; settle: boolean; index: number }[] = []
    const startLeg = () => {
      const leg = legs.shift()
      if (!leg) return
      const from = camera.position.clone()
      const dist = from.distanceTo(leg.to)
      phase = {
        kind: 'move',
        from,
        to: leg.to,
        look: leg.look,
        t: 0,
        dur: reduce ? 0.01 : leg.fly ? clamp(dist / 6.5, 1.45, 2.4) : clamp(dist / 1.12, 0.55, 2.35),
        fly: leg.fly,
        index: leg.index,
        settle: leg.settle,
      }
    }

    const goDoll = () => {
      phase = null
      mode = 'doll'
      setModo('maquete')
      setPoi(null)
      startTween(apt.doll.pos, apt.doll.target, DOLL_FOV, DOLL_CLIP, 'doll', 1.05)
    }

    const goWalk = () => {
      phase = null
      if (mode === 'walk' && !tween) return
      if (mode === 'tour' && camera.position.y < 2.3) {
        mode = 'walk'
        grab()
        camera.position.y = OLHO
        apt.clip.constant = WALK_CLIP
        camera.fov = WALK_FOV
        camera.updateProjectionMatrix()
        orbit.enabled = false
        setModo('caminhar')
        return
      }
      mode = 'walk'
      setModo('caminhar')
      const dest = new THREE.Vector3(apt.spawn.x, OLHO, apt.spawn.z)
      const room = apt.rooms.find((r) => inside(apt.spawn, r.poly))
      const look = room
        ? new THREE.Vector3(room.interior.x, 1, room.interior.z)
        : dest.clone().add(new THREE.Vector3(0, -0.2, 1))
      startTween(dest, look, WALK_FOV, WALK_CLIP, 'walk', 1.15)
    }

    const beginMove = (index: number, fly: boolean) => {
      const stop = apt.tour[index]
      const goal = { x: stop.eye.x, z: stop.eye.z }
      const pts = fly ? [goal] : routeTo({ x: camera.position.x, z: camera.position.z }, goal)
      legs = pts.map((p, i) => {
        const last = i === pts.length - 1
        const nxt = pts[Math.min(i + 1, pts.length - 1)]
        return {
          to: new THREE.Vector3(p.x, OLHO, p.z),
          look: last ? stop.look.clone() : new THREE.Vector3(nxt.x, 1.15, nxt.z),
          fly: fly && i === 0,
          settle: last,
          index,
        }
      })
      startLeg()
    }

    const goTour = () => {
      if (!apt.tour.length) {
        goWalk()
        return
      }
      if (mode === 'tour') {
        goDoll()
        return
      }
      tween = null
      orbit.enabled = false
      mode = 'tour'
      setModo('visita')
      beginMove(0, camera.position.y > 2.2)
    }

    const nearestFree = (x: number, z: number): Vec | null => {
      const polys = apt.rooms.map((r) => r.poly)
      if (!blocked(x, z, apt.blocks, apt.cols, polys, apt.thresholds)) return { x, z }
      for (let rad = 0.2; rad <= 1.4; rad += 0.2) {
        for (let a = 0; a < 8; a++) {
          const p = { x: x + Math.cos(a) * rad, z: z + Math.sin(a) * rad }
          if (!blocked(p.x, p.z, apt.blocks, apt.cols, polys, apt.thresholds)) return p
        }
      }
      return null
    }

    const goPoint = (px: number, py: number) => {
      const world = { x: (px - apt.geom.cx) * apt.geom.scale, z: (py - apt.geom.cy) * apt.geom.scale }
      const room = apt.rooms.find((r) => inside(world, r.poly))
      if (!room) return
      if (mode === 'doll' || (mode === 'tour' && camera.position.y > 2.4)) {
        phase = null
        const target = new THREE.Vector3(room.interior.x, 0.3, room.interior.z)
        const offset = camera.position.clone().sub(orbit.target)
        if (offset.length() < 0.1) offset.set(0, apt.geom.span * 0.7, apt.geom.span * 0.5)
        offset.setLength(clamp(offset.length(), apt.geom.span * 0.42, apt.geom.span * 0.95))
        offset.y = Math.max(offset.y, apt.geom.span * 0.38)
        mode = 'doll'
        setModo('maquete')
        startTween(target.clone().add(offset), target, DOLL_FOV, DOLL_CLIP, 'doll', 0.8)
        return
      }
      const spot = nearestFree(world.x, world.z) ?? nearestFree(room.interior.x, room.interior.z)
      if (!spot) return
      phase = null
      mode = 'walk'
      setModo('caminhar')
      const dest = new THREE.Vector3(spot.x, OLHO, spot.z)
      const look = new THREE.Vector3(room.interior.x, 1, room.interior.z)
      startTween(dest, look, WALK_FOV, WALK_CLIP, 'walk', clamp(camera.position.distanceTo(dest) / 2.2, 0.45, 1.3))
    }

    api.current = { maquete: goDoll, caminhar: goWalk, visita: goTour, irPara: goPoint, assumir: () => mode === 'tour' && goWalk() }

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Escape') {
        if (mode !== 'doll') goDoll()
        return
      }
      const move = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)
      if (!move && e.code !== 'ShiftLeft' && e.code !== 'ShiftRight') return
      if (mode !== 'walk' && mode !== 'tour') return
      if (move) e.preventDefault()
      keys.add(e.code)
      if (move && mode === 'tour') goWalk()
    }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)

    let dragging = false
    let dragX = 0
    let dragY = 0
    let dragMoved = 0
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.walk-hit')) return
      dragging = true
      dragMoved = 0
      dragX = e.clientX
      dragY = e.clientY
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging || mode !== 'walk' || tween) return
      const dx = e.clientX - dragX
      const dy = e.clientY - dragY
      dragX = e.clientX
      dragY = e.clientY
      dragMoved += Math.abs(dx) + Math.abs(dy)
      const sens = e.pointerType === 'touch' ? 0.0048 : 0.0027
      yaw -= dx * sens
      pitch = clamp(pitch - dy * sens * 0.85, -1.05, 1.05)
    }
    const onUp = (e: PointerEvent) => {
      if (!dragging) return
      const moved = dragMoved + Math.abs(e.clientX - dragX) + Math.abs(e.clientY - dragY)
      dragging = false
      if (moved > 7 || mode !== 'doll' || tween) return
      const rect = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      const ray = new THREE.Raycaster()
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(apt.floors, false)[0]
      const id = hit?.object.userData.roomId as string | undefined
      if (!id) return
      const room = apt.rooms.find((r) => r.id === id)
      if (!room) return
      const target = new THREE.Vector3(room.interior.x, 0.3, room.interior.z)
      const offset = camera.position.clone().sub(orbit.target)
      offset.setLength(clamp(offset.length() * 0.92, apt.geom.span * 0.4, apt.geom.span * 0.9))
      offset.y = Math.max(offset.y, apt.geom.span * 0.36)
      startTween(target.clone().add(offset), target, DOLL_FOV, DOLL_CLIP, 'doll', 0.75)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = Math.max(1, el.clientHeight)
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(el)

    const planImg = new Image()
    planImg.src = planta.imagem
    const look = new THREE.Vector3()
    const ahead = new THREE.Vector3()
    const forward = new THREE.Vector3()
    const right = new THREE.Vector3()
    const clock = new THREE.Clock()
    const tmp = new THREE.Vector2()

    const updateTour = (dt: number) => {
      if (!phase) return
      phase.t += dt
      const u = ease(Math.min(1, phase.t / phase.dur))
      if (phase.kind === 'move') {
        camera.position.lerpVectors(phase.from, phase.to, u)
        if (phase.fly) {
          camera.lookAt(phase.look)
          apt.clip.constant = THREE.MathUtils.lerp(DOLL_CLIP, WALK_CLIP, u)
          camera.fov = THREE.MathUtils.lerp(DOLL_FOV, WALK_FOV, u)
          camera.updateProjectionMatrix()
        } else if (phase.settle) {
          ahead.copy(phase.from).lerp(phase.to, Math.min(1, u + 0.18))
          ahead.y = 1.2
          const settle = THREE.MathUtils.smoothstep(u, 0.4, 1)
          look.copy(ahead).lerp(phase.look, settle)
          camera.lookAt(look)
        } else camera.lookAt(phase.look)
        if (phase.t >= phase.dur) {
          if (!phase.settle) startLeg()
          else {
            const stop: TourStop = apt.tour[phase.index]
            phase = {
              kind: 'hold',
              index: phase.index,
              t: 0,
              dur: reduce ? 0.2 : stop.foto ? 3.05 : 2.25,
              pos: stop.eye.clone(),
              look: stop.look.clone(),
            }
          }
        }
      } else if (phase.kind === 'hold') {
        camera.position.copy(phase.pos)
        camera.lookAt(phase.look)
        if (phase.t >= phase.dur) {
          const next = phase.index + 1
          if (next >= apt.tour.length) {
            phase = { kind: 'rise', t: 0, dur: reduce ? 0.01 : 1.65, from: camera.position.clone(), fromQ: camera.quaternion.clone() }
          } else beginMove(next, false)
        }
      } else {
        camera.position.lerpVectors(phase.from, apt.doll.pos, u)
        camera.quaternion.slerpQuaternions(phase.fromQ, quatLook(apt.doll.pos, apt.doll.target), u)
        apt.clip.constant = THREE.MathUtils.lerp(WALK_CLIP, DOLL_CLIP, u)
        camera.fov = THREE.MathUtils.lerp(WALK_FOV, DOLL_FOV, u)
        camera.updateProjectionMatrix()
        if (phase.t >= phase.dur) {
          phase = null
          mode = 'doll'
          orbit.target.copy(apt.doll.target)
          camera.position.copy(apt.doll.pos)
          orbit.enabled = true
          orbit.update()
          setModo('maquete')
          setPoi(null)
        }
      }
      if (phase && bar.current) {
        const idx = phase.kind === 'rise' ? apt.tour.length : phase.kind === 'hold' ? phase.index + 0.7 : phase.index + 0.35 * Math.min(1, phase.t / phase.dur)
        bar.current.style.width = `${(idx / apt.tour.length) * 100}%`
      }
    }

    const proj = new THREE.Vector3()
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05)
      if (tween) {
        tween.t += dt
        const u = ease(Math.min(1, tween.t / tween.dur))
        camera.position.lerpVectors(tween.from, tween.to, u)
        camera.quaternion.slerpQuaternions(tween.fromQ, tween.toQ, u)
        camera.fov = THREE.MathUtils.lerp(tween.fromFov, tween.toFov, u)
        camera.updateProjectionMatrix()
        apt.clip.constant = THREE.MathUtils.lerp(tween.fromClip, tween.toClip, u)
        orbit.target.lerpVectors(tween.fromTarget, tween.toTarget, u)
        if (tween.t >= tween.dur) finishTween()
      } else if (mode === 'doll') {
        orbit.update()
      } else if (mode === 'tour') {
        updateTour(dt)
      } else {
        camera.position.y = OLHO
        euler.set(pitch, yaw, 0, 'YXZ')
        camera.quaternion.setFromEuler(euler)
        forward.set(-Math.sin(yaw), 0, -Math.cos(yaw))
        right.set(Math.cos(yaw), 0, -Math.sin(yaw))
        let ix = 0
        let iz = 0
        if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1
        if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1
        if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1
        if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1
        ix += joy.current.x
        iz += -joy.current.y
        tmp.set(ix, iz)
        if (tmp.length() > 1) tmp.normalize()
        const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 0.72 : 1.5
        wish.set(0, 0, 0)
        wish.addScaledVector(right, tmp.x * speed)
        wish.addScaledVector(forward, tmp.y * speed)
        vel.lerp(wish, 1 - Math.exp(-9 * dt))
        const stepX = vel.x * dt
        const stepZ = vel.z * dt
        const p = camera.position
        if (stepX || stepZ) {
          if (!blocked(p.x + stepX, p.z, apt.blocks, apt.cols, polys, apt.thresholds)) p.x += stepX
          if (!blocked(p.x, p.z + stepZ, apt.blocks, apt.cols, polys, apt.thresholds)) p.z += stepZ
        }
      }

      const eye = camera.position
      const here = apt.rooms.find((r) => inside({ x: eye.x, z: eye.z }, r.poly))
      const stopNow =
        mode === 'tour' && phase && (phase.kind === 'hold' || (phase.kind === 'move' && phase.fly))
          ? apt.tour[phase.index]
          : undefined
      const id = stopNow?.roomId ?? here?.id ?? ''
      if (id !== pending) {
        pending = id
        pendingAt = clock.elapsedTime
      }
      if (id === pending && (id === roomNow || clock.elapsedTime - pendingAt > 0.12)) {
        roomNow = id
        const nome = stopNow?.nome ?? here?.nome
        const area = stopNow?.area ?? here?.area
        const text = nome && area != null && mode !== 'doll' ? `${nome} · ${fmt(area)} m²` : ''
        if (text !== hudText) {
          hudText = text
          setHud(text)
        }
        const foto = mode === 'doll' ? '' : (stopNow?.foto ?? (here?.foto || ''))
        if (foto !== poiFoto) {
          poiFoto = foto
          const label = stopNow?.nome ?? here?.nome ?? ''
          setPoi(foto ? { nome: label, foto } : null)
        }
      }

      const dollT = 1 - THREE.MathUtils.smoothstep(apt.clip.constant, 1.4, 2.5)
      const box = labels.current
      if (box) {
        const nodes = box.querySelectorAll<HTMLElement>('[data-room]')
        nodes.forEach((node) => {
          const room = apt.rooms.find((r) => r.id === node.dataset.room)
          if (!room) return
          const v = proj.set(room.interior.x, 1.28, room.interior.z).project(camera)
          const visible = dollT > 0.62 && v.z < 1 && v.x > -1.15 && v.x < 1.15 && v.y > -1.15 && v.y < 1.15
          node.style.opacity = visible ? String(clamp((dollT - 0.62) / 0.3, 0, 1)) : '0'
          const x = (v.x * 0.5 + 0.5) * el.clientWidth
          const y = (-v.y * 0.5 + 0.5) * el.clientHeight
          node.style.transform = `translate(-50%, -120%) translate(${x}px, ${y}px)`
        })
      }
      drawMini(apt, camera, orbit, mini.current, planImg, mode, here?.id ?? '', miniDir)
      renderer.render(apt.scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      ro.disconnect()
      orbit.dispose()
      apt.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      api.current = null
    }
  }, [planta])

  const hint =
    modo === 'visita'
      ? 'Visita guiada · mova o mouse, o joystick ou WASD para assumir'
      : modo === 'caminhar'
        ? coarse
          ? 'Joystick para andar · arraste para olhar'
          : 'Arraste para olhar · W A S D para andar · Shift devagar'
        : coarse
          ? 'Um dedo gira · dois dedos aproximam'
          : 'Arraste para girar · role para aproximar · clique num ambiente'

  return (
    <div className="walk">
      <div ref={host} className="walk-canvas" tabIndex={0} />
      <div ref={labels} className="walk-labels">
        {planta.rooms.map((r) => (
          <div key={r.id} data-room={r.id} className={r.area < 2.6 ? 'walk-label sm' : 'walk-label'}>
            <b>{r.nome}</b>
            {r.area >= 2.6 && <small>{fmt(r.area)} m²</small>}
          </div>
        ))}
      </div>
      <div className="walk-ui">
        <div className="walk-bar">
          <div className="seg walk-hit">
            <button className={modo === 'maquete' ? 'on' : ''} onClick={() => api.current?.maquete()}>
              Vista de cima
            </button>
            <button className={modo === 'caminhar' ? 'on' : ''} onClick={() => api.current?.caminhar()}>
              Caminhar
            </button>
          </div>
          <button className={`walk-tour walk-hit ${modo === 'visita' ? 'on' : ''}`} onClick={() => api.current?.visita()}>
            {modo === 'visita' ? 'Encerrar visita' : 'Visita guiada'}
          </button>
        </div>
        <span className="walk-approx">Proporções aproximadas</span>
        {modo === 'visita' && (
          <div className="walk-prog">
            <span ref={bar} />
          </div>
        )}
        {hud && modo !== 'maquete' && (
          <div className="walk-hud">
            <span key={hud}>{hud}</span>
          </div>
        )}
        <p className="walk-hint">{hint}</p>
        <button
          type="button"
          className="walk-mini walk-hit"
          onClick={(e) => {
            const c = mini.current
            if (!c) return
            const r = c.getBoundingClientRect()
            const u = (e.clientX - r.left) / r.width
            const v = (e.clientY - r.top) / r.height
            api.current?.irPara(u * 800, v * 600)
          }}
          aria-label="Minimapa da planta. Clique para ir até um ponto."
        >
          <canvas ref={mini} width={400} height={300} />
        </button>
        {poi && (
          <button type="button" className="walk-poi walk-hit" onClick={() => setLight(poi.foto)}>
            <img src={poi.foto} alt="" />
            <span>Referência da construtora · {poi.nome}</span>
          </button>
        )}
        {coarse && modo !== 'maquete' && (
          <div
            className="joy walk-hit"
            onPointerDown={(e) => {
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              setJoy(e, joy.current, knob.current)
              api.current?.assumir()
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) setJoy(e, joy.current, knob.current)
            }}
            onPointerUp={(e) => {
              joy.current.x = 0
              joy.current.y = 0
              if (knob.current) knob.current.style.transform = 'translate(-50%, -50%)'
              e.currentTarget.releasePointerCapture(e.pointerId)
            }}
          >
            <span ref={knob} />
          </div>
        )}
      </div>
      {light && (
        <button type="button" className="walk-light" onClick={() => setLight(null)} aria-label="Fechar foto">
          <img src={light} alt="Referência ilustrativa da construtora" />
        </button>
      )}
    </div>
  )
}

function setJoy(e: ReactPointerEvent<HTMLDivElement>, joy: { x: number; y: number }, knob: HTMLSpanElement | null) {
  const rect = e.currentTarget.getBoundingClientRect()
  let x = (e.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.42)
  let y = (e.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.42)
  const m = Math.hypot(x, y)
  if (m > 1) {
    x /= m
    y /= m
  }
  joy.x = x
  joy.y = y
  if (knob) knob.style.transform = `translate(-50%, -50%) translate(${x * 28}px, ${y * 28}px)`
}

const miniDir = new THREE.Vector3()

function drawMini(
  apt: Apartment,
  camera: THREE.PerspectiveCamera,
  orbit: OrbitControls,
  canvas: HTMLCanvasElement | null,
  img: HTMLImageElement,
  mode: 'doll' | 'walk' | 'tour',
  roomId: string,
  dir: THREE.Vector3,
) {
  if (!canvas || !img.complete || !img.naturalWidth) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  const sx = (p: Vec) => (toPx(apt.geom, p)[0] / 800) * w
  const sy = (p: Vec) => (toPx(apt.geom, p)[1] / 600) * h
  const room = apt.rooms.find((r) => r.id === roomId)
  if (room) {
    ctx.beginPath()
    room.poly.forEach((p, i) => (i ? ctx.lineTo(sx(p), sy(p)) : ctx.moveTo(sx(p), sy(p))))
    ctx.closePath()
    ctx.fillStyle = 'rgba(31, 77, 58, 0.28)'
    ctx.fill()
  }
  const walking = mode !== 'doll' && camera.position.y < 2.4
  const pos = walking
    ? { x: camera.position.x, z: camera.position.z }
    : { x: orbit.target.x, z: orbit.target.z }
  const x = sx(pos)
  const y = sy(pos)
  ctx.save()
  ctx.translate(x, y)
  if (walking) {
    camera.getWorldDirection(dir)
    ctx.rotate(Math.atan2(dir.z, dir.x))
    ctx.beginPath()
    ctx.moveTo(16, 0)
    ctx.lineTo(-6, 9)
    ctx.lineTo(-2, 0)
    ctx.lineTo(-6, -9)
    ctx.closePath()
    ctx.fillStyle = 'rgba(31, 77, 58, 0.92)'
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(0, 0, walking ? 4 : 5, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = '#1f4d3a'
  ctx.stroke()
  ctx.restore()
}
