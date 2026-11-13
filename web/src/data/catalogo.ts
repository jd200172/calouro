import { imovel } from './edimburgo'

export type Tipo = 'Apartamento' | 'Casa' | 'Cobertura'

export interface Item {
  id: string
  nome: string
  bairro: string
  tipo: Tipo
  dormitorios: number
  preco: number
  estado: 'Pronto' | 'Em construção'
  /** imóvel que o corretor está empurrando agora (sobe nas sugestões) */
  foco: boolean
  /** imóvel fictício, usado só para demonstrar sugestões e busca */
  exemplo: boolean
  /** foto real; sem foto, a capa é uma ilustração gerada a partir de `matiz` */
  foto?: string
  matiz: number
}

export const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// Catálogo de até ~25 imóveis. Só o Edimburgo é real; os demais são exemplos fictícios.
export const catalogo: Item[] = [
  {
    id: 'edimburgo',
    nome: imovel.nome,
    bairro: imovel.bairro,
    tipo: 'Apartamento',
    dormitorios: imovel.dormitorios,
    preco: imovel.preco,
    estado: 'Em construção',
    foco: true,
    exemplo: false,
    foto: imovel.galeria[0].src,
    matiz: 150,
  },
  { id: 'ex-aurora', nome: 'Residencial Aurora', bairro: 'Itoupava Norte', tipo: 'Apartamento', dormitorios: 2, preco: 565000, estado: 'Pronto', foco: true, exemplo: true, matiz: 200 },
  { id: 'ex-lumiar', nome: 'Edifício Lumiar', bairro: 'Vila Nova', tipo: 'Apartamento', dormitorios: 3, preco: 790000, estado: 'Em construção', foco: false, exemplo: true, matiz: 150 },
  { id: 'ex-palmeiras', nome: 'Casa Jardim das Palmeiras', bairro: 'Victor Konder', tipo: 'Casa', dormitorios: 3, preco: 980000, estado: 'Pronto', foco: false, exemplo: true, matiz: 30 },
  { id: 'ex-solar', nome: 'Edifício Solar do Vale', bairro: 'Victor Konder', tipo: 'Apartamento', dormitorios: 3, preco: 720000, estado: 'Pronto', foco: true, exemplo: true, matiz: 260 },
  { id: 'ex-mirante', nome: 'Cobertura Mirante', bairro: 'Ponta Aguda', tipo: 'Cobertura', dormitorios: 3, preco: 1450000, estado: 'Pronto', foco: false, exemplo: true, matiz: 330 },
  { id: 'ex-claro', nome: 'Casa Ribeirão Claro', bairro: 'Velha', tipo: 'Casa', dormitorios: 4, preco: 1890000, estado: 'Pronto', foco: false, exemplo: true, matiz: 90 },
  { id: 'ex-bosque', nome: 'Residencial Bosque', bairro: 'Vila Nova', tipo: 'Apartamento', dormitorios: 2, preco: 610000, estado: 'Em construção', foco: false, exemplo: true, matiz: 170 },
  { id: 'ex-alianca', nome: 'Edifício Aliança', bairro: 'Escola Agrícola', tipo: 'Apartamento', dormitorios: 3, preco: 840000, estado: 'Em construção', foco: false, exemplo: true, matiz: 230 },
]

export interface Sugestao {
  item: Item
  motivos: string[]
}

/** Regra simples, sem IA: bairro, faixa de preço, tipo, dormitórios, estado e foco do corretor. */
export function sugerir(atual: Item, n = 3): Sugestao[] {
  return catalogo
    .filter((i) => i.id !== atual.id)
    .map((i) => {
      const motivos: string[] = []
      let pontos = 0
      if (i.bairro === atual.bairro) { pontos += 3; motivos.push('Mesmo bairro') }
      if (Math.abs(i.preco - atual.preco) / atual.preco <= 0.25) { pontos += 2; motivos.push('Faixa de preço parecida') }
      if (i.tipo === atual.tipo) pontos += 1
      if (i.dormitorios === atual.dormitorios) { pontos += 1; motivos.push(`${i.dormitorios} dormitórios`) }
      if (i.estado === 'Pronto' && atual.estado !== 'Pronto') { pontos += 1; motivos.push('Pronto para morar') }
      if (i.foco) pontos += 2
      if (!motivos.length) motivos.push('Em destaque')
      return { item: i, motivos: motivos.slice(0, 2), pontos, dist: Math.abs(i.preco - atual.preco) }
    })
    .sort((a, b) => b.pontos - a.pontos || a.dist - b.dist)
    .slice(0, n)
    .map(({ item, motivos }) => ({ item, motivos }))
}

export const bairros = [...new Set(catalogo.map((i) => i.bairro))].sort()

export const faixas: [string, string][] = [
  ['', 'Qualquer preço'],
  ['ate600', 'Até R$ 600 mil'],
  ['600a1000', 'R$ 600 mil a R$ 1 mi'],
  ['acima1000', 'Acima de R$ 1 mi'],
]

export const dormitorios: [string, string][] = [
  ['', 'Dormitórios'],
  ['2', '2'],
  ['3', '3'],
  ['4', '4 ou mais'],
]

export function filtrar(f: { bairro: string; faixa: string; dorm: string }): Item[] {
  return catalogo.filter((i) => {
    if (f.bairro && i.bairro !== f.bairro) return false
    if (f.faixa === 'ate600' && i.preco > 600000) return false
    if (f.faixa === '600a1000' && (i.preco <= 600000 || i.preco > 1000000)) return false
    if (f.faixa === 'acima1000' && i.preco <= 1000000) return false
    if (f.dorm === '4' ? i.dormitorios < 4 : f.dorm && i.dormitorios !== Number(f.dorm)) return false
    return true
  })
}
