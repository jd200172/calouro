import { useState } from 'react'
import { imovel, plantas } from './data/edimburgo'
import { FloorPlan } from './components/FloorPlan'
import { Walk3D } from './components/Walk3D'
import { Entorno } from './components/Entorno'
import { Pagamento } from './components/Pagamento'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function App() {
  const [pid, setPid] = useState(plantas[0].id)
  const planta = plantas.find((p) => p.id === pid)!

  return (
    <>
      <header className="top">
        <span className="marca">Calouro</span>
        <nav>
          <a href="#planta">Planta</a>
          <a href="#3d">Por dentro</a>
          <a href="#entorno">Entorno</a>
          <a href="#pagamento">Pagamento</a>
          <a href="#fotos">Fotos</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <img src={imovel.galeria[0].src} alt="" />
          <div className="hero-txt">
            <p className="eyebrow">
              Lançamento · {imovel.bairro}, {imovel.cidade}
            </p>
            <h1>{imovel.nome}</h1>
            <p className="sub">
              {imovel.dormitorios} dormitórios ({imovel.suites} suíte) · {imovel.vagas} vagas · {imovel.opcoesPlanta}{' '}
              opções de planta · entrega em {imovel.entrega}
            </p>
            <p className="preco">
              a partir de <b>{brl(imovel.preco)}</b> · entrada {brl(imovel.entrada)}
            </p>
          </div>
        </section>

        <section id="planta" className="bloco">
          <div className="bloco-cab">
            <h2>Planta</h2>
            <div className="seg">
              {plantas.map((p) => (
                <button key={p.id} className={p.id === pid ? 'on' : ''} onClick={() => setPid(p.id)}>
                  {p.nome}
                </button>
              ))}
            </div>
          </div>
          <FloorPlan key={planta.id} planta={planta} />
        </section>

        <section id="3d" className="bloco">
          <div className="bloco-cab">
            <h2>Por dentro</h2>
            <span className="tag">{planta.nome}</span>
          </div>
          <Walk3D key={planta.id} planta={planta} />
          <p className="note">
            Modelo gerado a partir da planta: paredes, vãos e pisos levantados sobre o desenho da construtora, pé-direito de 2,60 m.
            O mobiliário é ilustrativo, para dar escala. Proporções aproximadas.
          </p>
        </section>

        <section id="entorno" className="bloco">
          <div className="bloco-cab">
            <h2>Entorno</h2>
          </div>
          <Entorno />
          <div className="enchente">
            <div>
              <h3>Enchente</h3>
              <p>
                Cota de enchente do endereço e comparação com as maiores cheias registradas em Blumenau. Fonte prevista:
                AlertaBlu / Defesa Civil.
              </p>
            </div>
            <div className="enchente-valor">
              <span className="k">—</span>
              <span className="l">aguardando endereço</span>
            </div>
          </div>
        </section>

        <section id="pagamento" className="bloco">
          <div className="bloco-cab">
            <h2>Pagamento direto com a construtora</h2>
          </div>
          <Pagamento />
        </section>

        <section id="fotos" className="bloco">
          <div className="bloco-cab">
            <h2>Fotos</h2>
            <span className="tag">imagens ilustrativas da construtora</span>
          </div>
          <div className="galeria">
            {imovel.galeria.map((g) => (
              <figure key={g.src}>
                <img src={g.src} alt={g.legenda} loading="lazy" />
                <figcaption>{g.legenda}</figcaption>
              </figure>
            ))}
          </div>
          <h3 className="cond-tit">No condomínio</h3>
          <ul className="cond">
            {imovel.condominio.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="rodape">
        <span>
          {imovel.corretor} · {imovel.construtora}
        </span>
        <span>
          Protótipo. Dados do <a href={imovel.anuncio}>anúncio original</a>.
        </span>
      </footer>
    </>
  )
}
