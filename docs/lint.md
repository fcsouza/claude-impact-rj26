# Por que estas regras estão desligadas

O Ultracite roda com o conjunto cheio. Três exceções, com motivo:

**Regras de estilo em `apps/web`.** `noJsxPropsBind`, `noNestedTernary`, `noParameterProperties`,
`noUnnecessaryConditions` e o limite de complexidade. A tela de ações da ficha
monta os manipuladores dentro do laço de abas e de campos; extrair cada um
viraria uma fábrica de funções, que cria função nova por render do mesmo jeito.
Com React 19 e o compilador do Next 16, a alocação não é o gargalo desta tela,
e o restante é preferência de escrita, não defeito.

**Barris em `packages/*/src/index.ts`.** O Drizzle pede
`import * as schema` para montar o cliente com tipos, e o pacote existe para
reexportar schema e conexão num lugar só.

**`performance/noAwaitInLoops` e `complexity/noExcessiveCognitiveComplexity`
e `noNonNullAssertion` em `packages/seed`.** O seed insere em lotes de propósito, um de cada vez, para
não sobrecarregar o banco remoto; a ordem entre as tabelas é o próprio ponto.
Ele é um script de carga, roda uma vez, e a leitura linear ajuda mais que a
divisão em funções pequenas.

**`complexity/noExcessiveCognitiveComplexity` em `apps/api/src/timeline.ts`.**
A função junta seis fontes de evento numa linha do tempo só. Quebrá-la em seis
funções espalharia a ordem cronológica, que é o que importa ali.
