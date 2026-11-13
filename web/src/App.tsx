import { useEffect, useState } from 'react'
import { imovel, plantas } from './data/edimburgo'
import { brl, catalogo, type Item } from './data/catalogo'
import { contato, linkContato } from './data/contato'
import { FloorPlan } from './components/FloorPlan'
import { Walk3D } from './components/Walk3D'
import { Entorno } from './components/Entorno'
import { Pagamento } from './components/Pagamento'
import { Sugestoes } from './components/Sugestoes'
import { Busca } from './components/Busca'

const atual = catalogo.find((i) => i.id === 'edimburgo')!

export default function App() {
  const [pid, setPid] = useState(plantas[0].id)
  const [busca, setBusca] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const planta = plantas.find((p) => p.id === pid)!
  const link = linkContato(imovel.nome)

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 3500)
    return () => clearTimeout(t)
  }, [aviso])

  const selecionar = (i: Item) => {
    setBusca(false)
    if (i.id === atual.id) window.scrollTo({ top: 0, behavior: 'smooth' })
    else setAviso(`Exemplo: a página de "${i.nome}" ainda não existe no protótipo.`)
  }

  return (
    <>
      <header className="top">
        <span className="marca">Calouro</span>
        <nav>
          <a href="#fotos">Fotos</a>
          <a href="#entorno">Onde fica</a>
          <a href="#pagamento">Pagamento</a>
          <a href="#planta">Planta</a>
          <a href="#3d">Por dentro</a>
          <a href="#sugestoes">Veja também</a>
        </nav>
        <div className="acoes">
          <button className="btn ghost" onClick={() => setBusca(true)}>
            Ver todos
          </button>
          <a className="btn" href="#contato">
            Contato
          </a>
        </div>
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
            <a className="btn" href={link} target="_blank" rel="noreferrer">
              Falar com o Carlos
            </a>
          </div>
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
        </section>

        <section id="entorno" className="bloco">
          <div className="bloco-cab">
            <h2>Onde fica</h2>
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

        <section id="contato" className="bloco contato">
          <div>
            <h2>Fale com o Carlos</h2>
            <p>Visita, plantas disponíveis e condições de pagamento do {imovel.nome}.</p>
            <p className="note">Protótipo: canal ({contato.canal}) e prazo de resposta a definir com o corretor.</p>
          </div>
          <a className="btn grande" href={link} target="_blank" rel="noreferrer">
            Chamar no {contato.canal}
          </a>
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
          <Walk3D planta={planta} />
          <p className="note">
            Modelo gerado a partir da planta: paredes levantadas sobre a imagem da construtora, pé-direito de 2,60 m.
            Proporções aproximadas.
          </p>
        </section>

        <section id="condominio" className="bloco">
          <div className="bloco-cab">
            <h2>No condomínio</h2>
          </div>
          <ul className="cond">
            {imovel.condominio.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>

        <section id="sugestoes" className="bloco">
          <div className="bloco-cab">
            <h2>Se gostou deste, veja também</h2>
          </div>
          <Sugestoes atual={atual} onSelecionar={selecionar} onVerTodos={() => setBusca(true)} />
        </section>
      </main>

      <footer className="rodape">
        <div>
          <p>
            {imovel.corretor} · {imovel.construtora}
          </p>
          {imovel.legal.map((t) => (
            <p key={t} className="legal">
              {t}
            </p>
          ))}
        </div>
        <div className="rodape-dir">
          <a href={link} target="_blank" rel="noreferrer">
            Falar com o Carlos
          </a>
          <span>
            Protótipo. Dados do <a href={imovel.anuncio}>anúncio original</a>. Imóveis marcados como exemplo são fictícios.
          </span>
        </div>
      </footer>

      <div className="barra-contato">
        <span>
          <small>a partir de</small>
          <b>{brl(imovel.preco)}</b>
        </span>
        <a className="btn" href={link} target="_blank" rel="noreferrer">
          Falar com o Carlos
        </a>
      </div>

      <Busca aberta={busca} onFechar={() => setBusca(false)} onSelecionar={selecionar} />
      {aviso && <div className="aviso">{aviso}</div>}
    </>
  )
}
