import { useState } from 'react'
import type { Planta, Room } from '../data/edimburgo'

const COR: Record<Room['tipo'], string> = {
  social: '#e8e2d6',
  intimo: '#d9c4a5',
  molhado: '#cfdde3',
  externo: '#d6e3cf',
  tecnico: '#dedede',
}

function centro(p: [number, number][]) {
  // centro da caixa envolvente; suficiente para polígonos ortogonais simples
  const xs = p.map((q) => q[0])
  const ys = p.map((q) => q[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

export function FloorPlan({ planta }: { planta: Planta }) {
  const [hover, setHover] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [modo, setModo] = useState<'humanizada' | 'vetorial'>('humanizada')
  const ativo = hover ?? sel
  const room = planta.rooms.find((r) => r.id === (sel ?? hover))
  const total = planta.rooms.reduce((s, r) => s + r.area, 0)
  const privativa = planta.rooms.filter((r) => r.tipo !== 'tecnico').reduce((s, r) => s + r.area, 0)

  return (
    <div className="plan">
      <div className="plan-stage">
        <div className="seg">
          <button className={modo === 'humanizada' ? 'on' : ''} onClick={() => setModo('humanizada')}>
            Humanizada
          </button>
          <button className={modo === 'vetorial' ? 'on' : ''} onClick={() => setModo('vetorial')}>
            Vetorial
          </button>
        </div>
        <svg viewBox="80 20 640 560" className="plan-svg" onMouseLeave={() => setHover(null)}>
          {modo === 'humanizada' && <image href={planta.imagem} x={0} y={0} width={800} height={600} />}
          {planta.rooms.map((r) => {
            const pts = r.poly.map((p) => p.join(',')).join(' ')
            const on = ativo === r.id
            const [cx, cy] = centro(r.poly)
            const xs = r.poly.map((p) => p[0])
            const ys = r.poly.map((p) => p[1])
            const estreito = Math.max(...xs) - Math.min(...xs) < 90 && Math.max(...ys) - Math.min(...ys) > 120
            return (
              <g
                key={r.id}
                onMouseEnter={() => setHover(r.id)}
                onClick={() => setSel(sel === r.id ? null : r.id)}
                style={{ cursor: 'pointer' }}
              >
                <polygon
                  points={pts}
                  fill={modo === 'vetorial' ? COR[r.tipo] : on ? 'rgba(31,77,58,.28)' : 'rgba(0,0,0,0)'}
                  stroke={modo === 'vetorial' ? '#2b2b2b' : on ? '#1f4d3a' : 'transparent'}
                  strokeWidth={modo === 'vetorial' ? 5 : 3}
                  opacity={modo === 'vetorial' && ativo && !on ? 0.55 : 1}
                />
                {modo === 'vetorial' && (
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    className="plan-label"
                    transform={estreito ? `rotate(-90 ${cx} ${cy})` : undefined}
                  >
                    <tspan x={cx}>{r.nome}</tspan>
                    <tspan x={cx} dy="1.25em">
                      {r.area.toFixed(2).replace('.', ',')} m²
                    </tspan>
                  </text>
                )}
              </g>
            )
          })}
          {modo === 'vetorial' &&
            planta.doors.map((d, i) => (
              <line key={i} x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} stroke={'#fbfaf7'} strokeWidth={7} />
            ))}
        </svg>
      </div>

      <aside className="plan-side">
        <div className="kpis">
          <div>
            <span className="k">{privativa.toFixed(1).replace('.', ',')} m²</span>
            <span className="l">soma dos cômodos</span>
          </div>
          <div>
            <span className="k">{planta.rooms.length}</span>
            <span className="l">ambientes</span>
          </div>
        </div>
        <ul className="rooms">
          {planta.rooms.map((r) => (
            <li
              key={r.id}
              className={ativo === r.id ? 'on' : ''}
              onMouseEnter={() => setHover(r.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setSel(sel === r.id ? null : r.id)}
            >
              <i style={{ background: COR[r.tipo] }} />
              <span>{r.nome}</span>
              <b>{r.area.toFixed(2).replace('.', ',')} m²</b>
            </li>
          ))}
        </ul>
        {room?.foto && <img className="room-photo" src={room.foto} alt={room.nome} />}
        <p className="note">
          Áreas conforme a planta da construtora (total {total.toFixed(2).replace('.', ',')} m² com área técnica). Os
          contornos foram traçados sobre a imagem e são aproximados.
        </p>
      </aside>
    </div>
  )
}
