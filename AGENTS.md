# Calouro

## Contexto
Plataforma de busca de imóveis residenciais para venda e aluguel, começando por Blumenau (SC). São dois produtos: um para quem procura imóvel e outro para quem anuncia. O corretor é o dono do anúncio e responde pela qualidade dele, apoiado por IA. O objetivo é um anúncio com planta, tour virtual, mapa e dados do entorno, produzido com o mínimo de interação humana.

## Escopo
Dentro (fase 1): o produto de quem procura, na web, com imóveis residenciais de Blumenau. A fase tem dois entregáveis: a página de imóvel, destino de anúncios pagos e com sugestão de outros imóveis, e uma busca simplificada para catálogos de até 25 imóveis.
Fora (fase 1): imóveis comerciais e rurais, outras cidades, app nativo, o produto do anunciante (exceto o mínimo para alimentar os anúncios), captação de imóveis, precificação, gestão de tráfego pago e o modelo de negócio.

## Regras e restrições
- Sem teto de orçamento. Serviços pagos são permitidos, mas qualquer novo serviço pago ou aumento de cobrança exige aviso e confirmação do usuário antes do uso, com custo estimado e motivo da escolha.
- Os anúncios vêm do corretor. Dados de terceiros (portais, bases públicas) entram só por canal autorizado, nunca por raspagem.
- A estética é requisito do produto: interface limpa, sem banner de publicidade e sem lista repetitiva de cards. Telas novas priorizam a planta, o mapa e o tour, não a grade de fotos.
- Chaves de API ficam em `.env`, nunca no repositório.
- Conteúdo, interface e documentação em pt-BR. TODO: confirmar.
- Mudanças em Contexto, Escopo ou Regras exigem confirmação do usuário.
