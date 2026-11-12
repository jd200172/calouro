import { useMemo, useState } from 'react'
import { imovel } from '../data/edimburgo'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function Campo(props: { label: string; value: number; onChange: (v: number) => void; step?: number; sufixo?: string }) {
  return (
    <label className="campo">
      <span>{props.label}</span>
      <div>
        <input type="number" value={props.value} step={props.step ?? 1} onChange={(e) => props.onChange(Number(e.target.value) || 0)} />
        {props.sufixo && <em>{props.sufixo}</em>}
      </div>
    </label>
  )
}

export function Pagamento() {
  const [preco, setPreco] = useState(imovel.preco)
  const [entrada, setEntrada] = useState(imovel.entrada)
  const [nReforcos, setNReforcos] = useState(6)
  const [reforco, setReforco] = useState(20000)
  const [parcelas, setParcelas] = useState(imovel.parcelasMax)
  const [cub, setCub] = useState(3000)
  const [cubAno, setCubAno] = useState(5)

  const r = useMemo(() => {
    const saldo = Math.max(0, preco - entrada - nReforcos * reforco)
    const base = parcelas > 0 ? saldo / parcelas : 0
    const i = Math.pow(1 + cubAno / 100, 1 / 12) - 1
    const serie = Array.from({ length: parcelas }, (_, k) => base * Math.pow(1 + i, k + 1))
    const reforcos = Array.from({ length: nReforcos }, (_, k) => reforco * Math.pow(1 + i, (k + 1) * 12))
    const total = entrada + serie.reduce((s, v) => s + v, 0) + reforcos.reduce((s, v) => s + v, 0)
    return { saldo, base, serie, total, emCub: (preco - entrada) / cub }
  }, [preco, entrada, nReforcos, reforco, parcelas, cub, cubAno])

  const max = Math.max(...r.serie, 1)
  const W = 520
  const H = 120
  const path = r.serie.map((v, k) => `${k ? 'L' : 'M'}${((k / Math.max(1, r.serie.length - 1)) * W).toFixed(1)},${(H - (v / max) * (H - 10)).toFixed(1)}`).join(' ')

  return (
    <div className="pag">
      <div className="pag-form">
        <Campo label="Preço" value={preco} onChange={setPreco} step={1000} sufixo="R$" />
        <Campo label="Entrada" value={entrada} onChange={setEntrada} step={1000} sufixo="R$" />
        <Campo label="Reforços anuais (exemplo)" value={nReforcos} onChange={setNReforcos} sufixo="x" />
        <Campo label="Valor do reforço (exemplo)" value={reforco} onChange={setReforco} step={1000} sufixo="R$" />
        <Campo label="Parcelas mensais" value={parcelas} onChange={setParcelas} sufixo="meses" />
        <Campo label="CUB atual (exemplo)" value={cub} onChange={setCub} step={10} sufixo="R$" />
        <Campo label="Variação do CUB ao ano (exemplo)" value={cubAno} onChange={setCubAno} step={0.5} sufixo="%" />
      </div>
      <div className="pag-out">
        <div className="kpis">
          <div>
            <span className="k">{brl(r.base)}</span>
            <span className="l">primeira parcela (sem correção)</span>
          </div>
          <div>
            <span className="k">{brl(r.serie[r.serie.length - 1] ?? 0)}</span>
            <span className="l">última parcela projetada</span>
          </div>
          <div>
            <span className="k">{brl(r.total)}</span>
            <span className="l">total pago projetado</span>
          </div>
          <div>
            <span className="k">{r.emCub.toFixed(1).replace('.', ',')} CUB</span>
            <span className="l">financiado direto com a construtora</span>
          </div>
        </div>
        <svg viewBox={`0 -4 ${W} ${H + 8}`} className="spark" preserveAspectRatio="none">
          <path d={path} fill="none" stroke="#1f4d3a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <p className="note">
          Simulação ilustrativa. O anúncio cita parcelamento em até 75 e em até 85 meses; o CUB e a variação anual são
          valores de exemplo. Condições reais com o corretor e a construtora.
        </p>
      </div>
    </div>
  )
}
