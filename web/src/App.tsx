import { useState } from 'react'
import { imovel, plantas } from './data/edimburgo'
import { FloorPlan } from './components/FloorPlan'
import { Walk3D } from './components/Walk3D'
import { pedirEstarRealista } from './walk/pedirRealista'
import { Entorno } from './components/Entorno'
import { Pagamento } from './components/Pagamento'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const hero = `${import.meta.env.BASE_URL}imoveis/edimburgo/estar-hero.jpg`
const zap = `https://wa.me/${imovel.whatsapp}?text=${encodeURIComponent('Olá, Carlos. Vi o Edifício Edimburgo no Calouro e quero conversar sobre o apartamento.')}`

export default function App() {
  const [pid, setPid] = useState(plantas[0].id)
  const planta = plantas.find((p) => p.id === pid)!

  const verEstar = () => {
    setPid('a')
    document.getElementById('3d')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(pedirEstarRealista, 700)
  }

  return (
    <>
      <header className="top">
        <a className="marca" href="#topo">
          Calouro
        </a>
        <nav>
          <a href="#porque">O apartamento</a>
          <a href="#planta">Planta</a>
          <a href="#3d">Passeio</a>
          <a href="#entorno">Vizinhança</a>
          <a href="#pagamento">Pagamento</a>
          <a href="#contato">Contato</a>
        </nav>
      </header>

      <main>
        <section className="hero" id="topo">
          <img src={hero} alt="Estar do Edifício Edimburgo, com painel de madeira, sofá e janela para a varanda" />
          <div className="hero-folha">
            <p className="eyebrow">
              Lançamento · {imovel.bairro}, {imovel.cidade}
            </p>
            <h1>{imovel.nome}</h1>
            <p className="sub">
              {imovel.dormitorios} dormitórios, {imovel.suites} suíte · {imovel.vagas} vagas · entrega em {imovel.entrega}
            </p>
            <p className="preco">
              a partir de <b>{brl(imovel.preco)}</b>
              <span>entrada {brl(imovel.entrada)}</span>
            </p>
            <div className="hero-acoes">
              <button type="button" className="btn" onClick={verEstar}>
                Entrar no estar
              </button>
              <a className="btn btn-sec" href={zap} target="_blank" rel="noreferrer">
                Falar com o Carlos
              </a>
            </div>
            <p className="hero-nota">Imagem gerada no Blender a partir da planta A. Proporções aproximadas.</p>
          </div>
        </section>

        <section id="porque" className="bloco">
          <div className="bloco-cab">
            <h2>Por que este apartamento</h2>
            <span className="tag">{imovel.construtora}</span>
          </div>
          <p className="lead">
            O Edimburgo fica em Itoupava Norte, em Blumenau. O anúncio do Carlos descreve um living integrado, varanda com
            churrasqueira e área de serviço independente, com entrega em {imovel.entrega}. O pagamento é direto com a{' '}
            {imovel.construtora}, corrigido pelo CUB.
          </p>
          <dl className="fatos">
            <div>
              <dt>A partir de</dt>
              <dd>{brl(imovel.preco)}</dd>
            </div>
            <div>
              <dt>Entrada</dt>
              <dd>{brl(imovel.entrada)}</dd>
            </div>
            <div>
              <dt>Saldo</dt>
              <dd>até {imovel.parcelasMax} meses, só pelo CUB</dd>
            </div>
            <div>
              <dt>Entrega</dt>
              <dd>{imovel.entrega}</dd>
            </div>
            <div>
              <dt>Planta</dt>
              <dd>
                {imovel.dormitorios} dormitórios, {imovel.suites} suíte, {imovel.banheiros} banheiros
              </dd>
            </div>
            <div>
              <dt>Garagem</dt>
              <dd>{imovel.vagas} vagas</dd>
            </div>
          </dl>
          <ul className="cond">
            {imovel.diferenciais.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <p className="note">
            O anúncio também cita parcelamento em até 85 meses e a possibilidade de estudar entrada e saldo com
            financiamento bancário depois das chaves. Registro de incorporação {imovel.registro}, 2º Ofício de Registro de
            Imóveis de Blumenau/SC.
          </p>
        </section>

        <section id="planta" className="bloco">
          <div className="bloco-cab">
            <h2>A planta, cômodo a cômodo</h2>
            <div className="seg">
              {plantas.map((p) => (
                <button key={p.id} className={p.id === pid ? 'on' : ''} onClick={() => setPid(p.id)}>
                  {p.nome}
                </button>
              ))}
            </div>
          </div>
          <p className="lead">
            O anúncio oferece {imovel.opcoesPlanta} opções de planta. Aqui estão a A e a B, com a metragem de cada ambiente
            como no desenho da construtora.
          </p>
          <FloorPlan key={planta.id} planta={planta} />
        </section>

        <section id="3d" className="bloco">
          <div className="bloco-cab">
            <h2>Caminhe antes de visitar</h2>
            <span className="tag">{planta.nome}</span>
          </div>
          <p className="lead">
            Na planta A, o estar abre em modo realista: luz assada e texturas livres. O restante do apartamento, e a planta
            B, seguem na maquete para a visita guiada.
          </p>
          <Walk3D key={planta.id} planta={planta} />
          <p className="note">
            Modelo gerado a partir da planta: paredes, vãos e pisos levantados sobre o desenho da construtora, pé-direito de
            2,60 m. O mobiliário é ilustrativo, para dar escala. Proporções aproximadas.
          </p>
          {planta.id === 'a' && (
            <figure className="filme">
              <video
                controls
                preload="none"
                poster={`${import.meta.env.BASE_URL}imoveis/edimburgo/visita-poster.jpg`}
                src={`${import.meta.env.BASE_URL}imoveis/edimburgo/visita-planta-a.mp4`}
              >
                Seu navegador não reproduz este vídeo.
              </video>
              <figcaption>
                Área social da planta A, filmada no Blender. A câmera sai da entrada, cruza o estar e chega na varanda, a
                cerca de 1 m/s e a 1,60 m de altura. A luz do dia entra pela varanda: o desenho não marca janelas nos
                quartos, e a circulação de 1,24 m² não cabe neste passeio.
              </figcaption>
            </figure>
          )}
        </section>

        <section id="entorno" className="bloco">
          <div className="bloco-cab">
            <h2>A vizinhança</h2>
            <span className="tag">Itoupava Norte</span>
          </div>
          <p className="lead">
            O endereço do prédio ainda não está confirmado. O mapa marca o centro do bairro e o que fica a poucos minutos a
            pé.
          </p>
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
              <span className="k">Exemplo</span>
              <span className="l">aguardando o endereço do prédio</span>
            </div>
          </div>
        </section>

        <section id="pagamento" className="bloco">
          <div className="bloco-cab">
            <h2>Como pagar</h2>
          </div>
          <p className="lead">
            Preço e entrada saem do anúncio. Os reforços anuais e o CUB não estão publicados: entram como exemplo, para você
            ver a forma da parcela.
          </p>
          <Pagamento />
        </section>

        <section id="fotos" className="bloco">
          <div className="bloco-cab">
            <h2>Fotos da construtora</h2>
            <span className="tag">ilustrativas</span>
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

        <section id="contato" className="bloco contato">
          <div>
            <p className="eyebrow escuro">Corretor do lançamento</p>
            <h2>{imovel.corretor}</h2>
            <p className="lead">
              CRECI {imovel.creci}. Ele vende os lançamentos da {imovel.construtora} e responde por este anúncio.
            </p>
            <p className="contato-dados">
              <a href={zap} target="_blank" rel="noreferrer">
                {imovel.telefone}
              </a>
              <a href={`mailto:${imovel.email}`}>{imovel.email}</a>
            </p>
            <div className="hero-acoes">
              <a className="btn" href={zap} target="_blank" rel="noreferrer">
                Chamar no WhatsApp
              </a>
              <a className="btn btn-sec" href={imovel.anuncio} target="_blank" rel="noreferrer">
                Ver o anúncio original
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="rodape">
        <span>
          {imovel.corretor} · CRECI {imovel.creci} · {imovel.construtora}
        </span>
        <span>
          Protótipo Calouro. Dados do <a href={imovel.anuncio}>anúncio original</a>.
        </span>
      </footer>

      <div className="barra">
        <div>
          <b>{brl(imovel.preco)}</b>
          <span>a partir de</span>
        </div>
        <button type="button" onClick={verEstar}>
          Ver o estar
        </button>
        <a href={zap} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
      </div>
    </>
  )
}
