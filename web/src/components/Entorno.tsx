import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import dados from '../data/entorno-edimburgo.json'
import { imovel } from '../data/edimburgo'

type Ponto = (typeof dados.pontos)[number]

const CATS: { id: string; nome: string; cor: string }[] = [
  { id: 'educacao', nome: 'Educação', cor: '#3b6ea8' },
  { id: 'mercado', nome: 'Mercados', cor: '#c07a2c' },
  { id: 'saude', nome: 'Saúde', cor: '#b5474b' },
  { id: 'transporte', nome: 'Ônibus', cor: '#5b5b5b' },
  { id: 'lazer', nome: 'Lazer', cor: '#3f8a5a' },
]

// caminhada: 80 m/min sobre a distância em linha reta x 1,3 (desvio típico de ruas)
const minutos = (m: number) => Math.max(1, Math.round((m * 1.3) / 80))

function circulo(lat: number, lon: number, raio: number) {
  const pts: [number, number][] = []
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2
    pts.push([lon + (raio / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (raio / 110540) * Math.sin(a)])
  }
  return pts
}

export function Entorno() {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [cat, setCat] = useState<string | null>(null)
  const { lat, lon } = imovel.local

  const porCat = useMemo(() => {
    const m: Record<string, Ponto[]> = {}
    for (const p of dados.pontos) (m[p.categoria] ??= []).push(p)
    return m
  }, [])

  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current!,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [lon, lat],
      zoom: 14.6,
      attributionControl: { compact: true },
    })
    map.current = m
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('load', () => {
      m.addSource('aprox', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circulo(lat, lon, 250)] } },
      })
      m.addLayer({ id: 'aprox-f', type: 'fill', source: 'aprox', paint: { 'fill-color': '#1f4d3a', 'fill-opacity': 0.12 } })
      m.addLayer({ id: 'aprox-l', type: 'line', source: 'aprox', paint: { 'line-color': '#1f4d3a', 'line-width': 1.5, 'line-dasharray': [2, 2] } })
      m.addSource('pois', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: dados.pontos.map((p) => ({
            type: 'Feature',
            properties: { nome: p.nome, categoria: p.categoria, cor: CATS.find((c) => c.id === p.categoria)?.cor },
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          })),
        },
      })
      m.addLayer({
        id: 'pois',
        type: 'circle',
        source: 'pois',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'categoria'], 'transporte'], 3.5, 6],
          'circle-color': ['get', 'cor'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
        },
      })
      const pop = new maplibregl.Popup({ closeButton: false, offset: 8 })
      m.on('mouseenter', 'pois', (e) => {
        m.getCanvas().style.cursor = 'pointer'
        const f = e.features![0]
        pop.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setText(f.properties.nome).addTo(m)
      })
      m.on('mouseleave', 'pois', () => {
        m.getCanvas().style.cursor = ''
        pop.remove()
      })
    })
    return () => m.remove()
  }, [lat, lon])

  useEffect(() => {
    const m = map.current
    if (!m || !m.isStyleLoaded() || !m.getLayer('pois')) return
    m.setFilter('pois', cat ? ['==', ['get', 'categoria'], cat] : null)
  }, [cat])

  return (
    <div className="entorno">
      <div ref={el} className="map" />
      <aside className="entorno-side">
        {CATS.map((c) => {
          const lista = porCat[c.id] ?? []
          const perto = lista[0]
          return (
            <button key={c.id} className={'cat' + (cat === c.id ? ' on' : '')} onClick={() => setCat(cat === c.id ? null : c.id)}>
              <i style={{ background: c.cor }} />
              <span className="cat-nome">{c.nome}</span>
              <span className="cat-n">{lista.length} até 1,2 km</span>
              {perto && (
                <span className="cat-perto">
                  {perto.nome} · {minutos(perto.distancia_m)} min a pé
                </span>
              )}
            </button>
          )
        })}
        <p className="note">
          Localização aproximada: centro do bairro {imovel.bairro}, até a confirmação do endereço. Pontos do
          OpenStreetMap; tempos estimados pela distância.
        </p>
      </aside>
    </div>
  )
}
