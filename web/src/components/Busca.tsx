import { useEffect, useRef, useState } from 'react'
import { bairros, brl, dormitorios, faixas, filtrar, type Item } from '../data/catalogo'
import { Capa } from './Ilustracao'

export function Busca({ aberta, onFechar, onSelecionar }: { aberta: boolean; onFechar: () => void; onSelecionar: (i: Item) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [bairro, setBairro] = useState('')
  const [faixa, setFaixa] = useState('')
  const [dorm, setDorm] = useState('')

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (aberta && !d.open) d.showModal()
    if (!aberta && d.open) d.close()
  }, [aberta])

  const lista = filtrar({ bairro, faixa, dorm })

  return (
    <dialog ref={ref} className="busca" onClose={onFechar} onClick={(e) => e.target === ref.current && onFechar()}>
      <div className="busca-cab">
        <h2>Todos os imóveis</h2>
        <button className="btn ghost" onClick={onFechar}>
          Fechar
        </button>
      </div>
      <div className="busca-filtros">
        <select aria-label="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)}>
          <option value="">Qualquer bairro</option>
          {bairros.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select aria-label="Faixa de preço" value={faixa} onChange={(e) => setFaixa(e.target.value)}>
          {faixas.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Dormitórios" value={dorm} onChange={(e) => setDorm(e.target.value)}>
          {dormitorios.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <ul className="busca-lista">
        {lista.map((i) => (
          <li key={i.id}>
            <button onClick={() => onSelecionar(i)}>
              <Capa item={i} />
              <span>
                <b>{i.nome}</b>
                {i.exemplo && <em className="chip ex"> exemplo</em>}
                <small>
                  {i.bairro} · {i.tipo} · {i.dormitorios} dorm. · {i.estado}
                </small>
              </span>
              <span className="sug-preco">{brl(i.preco)}</span>
            </button>
          </li>
        ))}
        {!lista.length && <li className="note">Nenhum imóvel com esses filtros.</li>}
      </ul>
    </dialog>
  )
}
