import { brl, sugerir, type Item } from '../data/catalogo'
import { Capa } from './Ilustracao'

export function Sugestoes({ atual, onSelecionar, onVerTodos }: { atual: Item; onSelecionar: (i: Item) => void; onVerTodos: () => void }) {
  const lista = sugerir(atual)
  return (
    <>
      <div className="sug">
        {lista.map(({ item, motivos }) => (
          <button key={item.id} className="sug-item" onClick={() => onSelecionar(item)}>
            <Capa item={item} />
            <div className="sug-corpo">
              <div className="chips">
                {motivos.map((m) => (
                  <span key={m} className="chip">
                    {m}
                  </span>
                ))}
                {item.exemplo && <span className="chip ex">exemplo</span>}
              </div>
              <div className="sug-nome">{item.nome}</div>
              <div className="sug-meta">
                {item.bairro} · {item.tipo} · {item.dormitorios} dorm. · {item.estado}
              </div>
              <div className="sug-preco">{brl(item.preco)}</div>
            </div>
          </button>
        ))}
      </div>
      <p className="note">
        <button className="link" onClick={onVerTodos}>
          Ver todos os imóveis
        </button>
      </p>
    </>
  )
}
