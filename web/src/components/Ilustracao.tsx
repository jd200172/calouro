import { useId } from 'react'
import type { Item, Tipo } from '../data/catalogo'

function gerador(seed: number) {
  let s = seed >>> 0
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
}

const hash = (t: string) => [...t].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)

/** Capa provisória: ilustração em SVG gerada a partir do tipo e do matiz do imóvel. */
export function Ilustracao({ tipo, matiz, seed }: { tipo: Tipo; matiz: number; seed: number }) {
  const id = useId().replace(/:/g, '')
  const r = gerador(seed)
  const ceu = `hsl(${matiz} 40% 88%)`
  const ceu2 = `hsl(${matiz} 35% 72%)`
  const chao = `hsl(${matiz} 25% 36%)`
  const parede = `hsl(${matiz} 18% 96%)`
  const traco = `hsl(${matiz} 20% 45%)`
  const acesa = 'hsl(42 90% 72%)'
  const apagada = `hsl(${matiz} 25% 78%)`

  const janelas = (x0: number, y0: number, cols: number, rows: number, w: number, h: number, gx: number, gy: number) =>
    Array.from({ length: rows * cols }, (_, k) => {
      const c = k % cols
      const l = Math.floor(k / cols)
      return <rect key={k} x={x0 + c * (w + gx)} y={y0 + l * (h + gy)} width={w} height={h} rx={2} fill={r() > 0.72 ? acesa : apagada} />
    })

  return (
    <svg viewBox="0 0 400 300" className="ilu" role="img" aria-label={`Ilustração de ${tipo.toLowerCase()}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ceu} />
          <stop offset="1" stopColor={ceu2} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id})`} />
      <circle cx={70 + r() * 260} cy={52} r={20} fill="hsl(42 90% 88%)" opacity={0.9} />
      <rect y="252" width="400" height="48" fill={chao} />
      {tipo === 'Casa' ? (
        <>
          <rect x="100" y="150" width="200" height="102" fill={parede} stroke={traco} />
          <polygon points="88,152 200,96 312,152" fill={`hsl(${matiz} 30% 40%)`} />
          {janelas(120, 172, 2, 1, 34, 34, 20, 0)}
          <rect x="248" y="190" width="30" height="62" rx="2" fill={`hsl(${matiz} 30% 30%)`} />
        </>
      ) : (
        <>
          {tipo === 'Cobertura' && (
            <>
              <rect x="130" y="52" width="140" height="30" fill={parede} stroke={traco} />
              <rect x="124" y="46" width="152" height="6" fill={traco} />
            </>
          )}
          <rect x="110" y="82" width="180" height="170" fill={parede} stroke={traco} />
          {janelas(126, 96, 4, 5, 28, 20, 14, 10)}
          <rect x="186" y="224" width="28" height="28" fill={`hsl(${matiz} 30% 30%)`} />
        </>
      )}
      <circle cx="46" cy="236" r="22" fill={`hsl(${matiz + 40} 30% 38%)`} />
      <circle cx="356" cy="240" r="18" fill={`hsl(${matiz + 40} 30% 34%)`} />
    </svg>
  )
}

export function Capa({ item }: { item: Item }) {
  return item.foto ? (
    <img src={item.foto} alt={item.nome} className="ilu" loading="lazy" />
  ) : (
    <Ilustracao tipo={item.tipo} matiz={item.matiz} seed={hash(item.id)} />
  )
}
