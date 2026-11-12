let pendente = false

export function pedirEstarRealista() {
  pendente = true
  window.dispatchEvent(new Event('calouro-realista'))
}

export function consumirEstarRealista() {
  if (!pendente) return false
  pendente = false
  return true
}
