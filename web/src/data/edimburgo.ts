// Dados do Edifício Edimburgo, extraídos do anúncio do corretor e das plantas humanizadas.
// Polígonos dos cômodos em pixels da imagem da planta (800x600), desenhados à mão sobre ela.
// Áreas vêm dos rótulos da planta; a geometria é aproximada.

export type Pt = [number, number]

export interface Room {
  id: string
  nome: string
  area: number // m², rótulo da planta
  poly: Pt[]
  tipo: 'social' | 'intimo' | 'molhado' | 'externo' | 'tecnico'
  foto?: string
}

export interface Door {
  a: Pt
  b: Pt
}

export interface Planta {
  id: string
  nome: string
  imagem: string
  rooms: Room[]
  // vãos nas paredes (portas e passagens abertas), em pixels
  doors: Door[]
  // ponto inicial da caminhada 3D, em pixels
  inicio: Pt
}

const R = (x1: number, y1: number, x2: number, y2: number): Pt[] => [
  [x1, y1],
  [x2, y1],
  [x2, y2],
  [x1, y2],
]

const base = '/imoveis/edimburgo/'

export const plantaA: Planta = {
  id: 'a',
  nome: 'Planta A · 2 dorm. (1 suíte)',
  imagem: base + 'planta-a.jpg',
  inicio: [520, 250],
  rooms: [
    { id: 'tecnica', nome: 'Área técnica', area: 1.69, tipo: 'tecnico', poly: R(118, 38, 168, 200) },
    { id: 'dormitorio', nome: 'Dormitório', area: 8.41, tipo: 'intimo', poly: R(168, 38, 410, 195) },
    { id: 'bwc1', nome: 'BWC social', area: 2.72, tipo: 'molhado', poly: R(168, 205, 340, 290) },
    {
      id: 'circulacao',
      nome: 'Circulação',
      area: 1.24,
      tipo: 'social',
      poly: R(340, 195, 418, 295),
    },
    { id: 'bwc2', nome: 'BWC suíte', area: 2.76, tipo: 'molhado', poly: R(168, 290, 340, 380) },
    {
      id: 'suite',
      nome: 'Suíte',
      area: 10.43,
      tipo: 'intimo',
      foto: base + 'suite.jpg',
      poly: [
        [168, 380],
        [340, 380],
        [340, 295],
        [418, 295],
        [418, 558],
        [168, 558],
      ],
    },
    {
      id: 'estar',
      nome: 'Estar / jantar',
      area: 15.66,
      tipo: 'social',
      foto: base + 'estar.jpg',
      poly: [
        [418, 38],
        [668, 38],
        [668, 100],
        [625, 100],
        [625, 325],
        [580, 325],
        [580, 435],
        [418, 435],
      ],
    },
    { id: 'cozinha', nome: 'Cozinha', area: 3.77, tipo: 'molhado', foto: base + 'jantar.jpg', poly: R(625, 100, 668, 325) },
    { id: 'servico', nome: 'Área de serviço', area: 2.23, tipo: 'molhado', poly: R(580, 325, 668, 435) },
    { id: 'varanda', nome: 'Varanda gourmet', area: 5.68, tipo: 'externo', poly: R(418, 435, 620, 565) },
  ],
  doors: [
    { a: [345, 195], b: [400, 195] }, // dormitório → circulação
    { a: [340, 210], b: [340, 250] }, // BWC social → circulação
    { a: [290, 380], b: [335, 380] }, // BWC suíte → suíte
    { a: [345, 295], b: [410, 295] }, // suíte → circulação
    { a: [418, 200], b: [418, 290] }, // circulação → estar
    { a: [625, 100], b: [625, 325] }, // estar → cozinha (aberta)
    { a: [585, 325], b: [625, 325] }, // cozinha → serviço
    { a: [420, 435], b: [578, 435] }, // estar → varanda
    { a: [625, 38], b: [665, 38] }, // entrada
  ],
}

export const plantaB: Planta = {
  id: 'b',
  nome: 'Planta B · 2 dorm. (1 suíte)',
  imagem: base + 'planta-b.jpg',
  inicio: [250, 260],
  rooms: [
    { id: 'cozinha', nome: 'Cozinha', area: 4.43, tipo: 'molhado', foto: base + 'jantar.jpg', poly: R(100, 155, 185, 300) },
    { id: 'servico', nome: 'Área de serviço', area: 2.05, tipo: 'molhado', poly: R(100, 300, 150, 400) },
    {
      id: 'estar',
      nome: 'Estar / jantar',
      area: 10.51,
      tipo: 'social',
      foto: base + 'estar.jpg',
      poly: [
        [185, 155],
        [330, 155],
        [330, 370],
        [150, 370],
        [150, 300],
        [185, 300],
      ],
    },
    {
      id: 'varanda',
      nome: 'Varanda gourmet',
      area: 3.9,
      tipo: 'externo',
      poly: [
        [150, 370],
        [330, 370],
        [330, 445],
        [100, 445],
        [100, 400],
        [150, 400],
      ],
    },
    { id: 'dormitorio', nome: 'Dormitório', area: 8.85, tipo: 'intimo', poly: R(330, 210, 465, 405) },
    { id: 'tecnica', nome: 'Área técnica', area: 1.33, tipo: 'tecnico', poly: R(330, 405, 465, 445) },
    {
      id: 'circulacao',
      nome: 'Circulação',
      area: 3.95,
      tipo: 'social',
      poly: [
        [330, 155],
        [520, 155],
        [520, 235],
        [465, 235],
        [465, 210],
        [330, 210],
      ],
    },
    { id: 'bwc1', nome: 'BWC social', area: 2.94, tipo: 'molhado', poly: R(520, 155, 660, 235) },
    {
      id: 'suite',
      nome: 'Suíte',
      area: 12.08,
      tipo: 'intimo',
      foto: base + 'suite.jpg',
      poly: [
        [465, 235],
        [690, 235],
        [690, 440],
        [545, 440],
        [545, 290],
        [465, 290],
      ],
    },
    { id: 'bwc2', nome: 'BWC suíte', area: 3.03, tipo: 'molhado', poly: R(465, 290, 545, 440) },
  ],
  doors: [
    { a: [278, 155], b: [318, 155] }, // entrada
    { a: [330, 160], b: [330, 205] }, // circulação → estar
    { a: [420, 210], b: [460, 210] }, // circulação → dormitório
    { a: [470, 235], b: [515, 235] }, // circulação → suíte
    { a: [520, 165], b: [520, 200] }, // circulação → BWC social
    { a: [480, 290], b: [530, 290] }, // suíte → BWC suíte
    { a: [185, 160], b: [185, 300] }, // estar → cozinha (aberta)
    { a: [150, 305], b: [150, 365] }, // estar → serviço
    { a: [155, 370], b: [325, 370] }, // estar → varanda
  ],
}

export const plantas = [plantaA, plantaB]

export const imovel = {
  nome: 'Edifício Edimburgo',
  construtora: 'Speranzini Engenharia',
  bairro: 'Itoupava Norte',
  cidade: 'Blumenau/SC',
  // ponto aproximado: centro do bairro (endereço do prédio não confirmado)
  local: { lat: -26.8796, lon: -49.0782, aproximado: true },
  preco: 538000,
  entrada: 85000,
  parcelasMax: 75,
  entrega: 'agosto de 2027',
  dormitorios: 2,
  suites: 1,
  banheiros: 2,
  vagas: 2,
  opcoesPlanta: 6,
  anuncio: 'https://carlosizidorocorretor.com.br/det-apto.php?Cod=1799',
  corretor: 'Carlos Izidoro · CRECI 18469',
  legal: [
    'Imagens ilustrativas, de caráter promocional. Móveis e eletrodomésticos têm dimensões comerciais e não fazem parte do contrato (Lei 4.591/64). Plantas com sugestão de decoração; as cores podem variar em relação à obra.',
    'Registro de Incorporação R.3-68987, 2º Ofício de Registro de Imóveis de Blumenau/SC.',
  ],
  condominio: ['Piscinas adulto e infantil', 'Salão de festas', 'Academia', 'Brinquedoteca', 'Reaproveitamento de água pluvial', 'Portaria eletrônica', 'Acessibilidade completa'],
  galeria: [
    { src: base + 'piscina.jpg', legenda: 'Piscina' },
    { src: base + 'estar.jpg', legenda: 'Estar' },
    { src: base + 'jantar.jpg', legenda: 'Jantar' },
    { src: base + 'suite.jpg', legenda: 'Suíte' },
    { src: base + 'academia.jpg', legenda: 'Academia' },
    { src: base + 'brinquedoteca.jpg', legenda: 'Brinquedoteca' },
    { src: base + 'salao-festas.jpg', legenda: 'Salão de festas' },
    { src: base + 'aerea.jpg', legenda: 'Vista aérea' },
  ],
}

// Geometria em metros: escala única por planta, calibrada pela soma das áreas rotuladas.
export function polyArea(p: Pt[]) {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]
    const [x2, y2] = p[(i + 1) % p.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

export function escala(pl: Planta) {
  const px = pl.rooms.reduce((s, r) => s + polyArea(r.poly), 0)
  const m2 = pl.rooms.reduce((s, r) => s + r.area, 0)
  return Math.sqrt(m2 / px) // metros por pixel
}
