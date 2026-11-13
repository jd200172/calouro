// PLACEHOLDER: canal, número e prazo de resposta ainda não foram definidos com o corretor.
// A página só deve prometer um prazo depois dessa decisão.
export const contato = {
  canal: 'WhatsApp',
  numero: '5547900000000',
}

export const linkContato = (assunto: string) =>
  `https://wa.me/${contato.numero}?text=${encodeURIComponent(`Olá, Carlos! Vi o ${assunto} e gostaria de mais informações.`)}`
