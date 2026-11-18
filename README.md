# Diário do sono

PWA simples para anotar o sono de um bebê: noites, despertares, sonecas, mamadas, saúde e peso.
Feito para usar de madrugada, com uma mão, por duas pessoas ao mesmo tempo.

**App:** https://cmgsilv-builder.github.io/diario-do-sono/

## Como funciona

- **Agora:** mostra se o bebê está dormindo ou acordado, há quanto tempo, a última mamada e a próxima soneca sugerida (pelas janelas típicas dos últimos 14 dias).
- **Despertar à noite:** um toque em "Acordou" e depois os códigos `M` mamou · `T` toque/shh · `C` colo · `S` voltou sozinho · `F` fralda · `A` ficou acordado.
- **Diário:** cada dia e cada noite, com tudo editável.
- **Gráficos:** linha do tempo das noites, primeiro sono, despertares, sono de dia e quem levantou.
- **Mais:** planejador do dia, guia noturno, saúde e peso, sincronização, exportar CSV/JSON.

## Onde ficam os dados

Este repositório tem **só o código**. Nenhum dado fica aqui.

Os registros ficam no aparelho e são sincronizados com um **repositório privado** separado
(um arquivo JSON por mês em `data/AAAA-MM.json`). Cada registro tem um `id` e um carimbo `updated`;
quando os dois celulares mexem ao mesmo tempo, a versão mais nova de cada registro vence.

## Configurar

1. Crie um token em GitHub → Settings → Developer settings → **Fine-grained tokens**:
   - Repository access: **Only select repositories** → o repositório de dados.
   - Permissions → Repository → **Contents: Read and write**.
2. No app: **Mais → Sincronização**. Preencha seu nome, `dono/repositorio-de-dados` e o token.
3. No outro celular, faça o mesmo com o mesmo token.

O token fica guardado só no aparelho (localStorage).

## Desenvolvimento

Sem build. HTML, CSS e JavaScript puro (módulos ES). Para testar localmente, sirva a pasta com qualquer servidor estático.
Ao mudar arquivos do app, aumente `VERSION` em `sw.js` para os celulares baixarem a versão nova.
