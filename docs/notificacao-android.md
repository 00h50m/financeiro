# Notificação de compra do Android → Finapp

Cada compra no cartão gera uma notificação do banco. Com o app **MacroDroid** (grátis, Play Store), o celular manda esse texto para o Finapp, e o bot do Telegram pergunta **Confirmar** (nada vira compra sem o seu toque).

Só funciona no Android. Vale para qualquer banco cuja notificação traga valor e local da compra (o Nubank já foi testado com um exemplo real).

## Passo 1 · pegar o token
No Telegram, mande **/android** para o bot. Ele responde com um token (começa com `fin_`). Ele aparece **uma vez só**: copie. Para desconectar o celular depois: `/android revogar`.

## Passo 2 · criar a macro no MacroDroid
1. Instale o MacroDroid e abra. Toque em **Adicionar macro**.
2. **Gatilho**: Notificação → *Notificação recebida* → escolha o app do banco (ex.: Nubank). Em "Conteúdo", deixe "qualquer".
3. **Ação**: Conectividade → *Requisição HTTP* (HTTP Request):
   - Método: **POST**
   - Endereço: `https://financeiro-lake-rho.vercel.app/api/notificacao`
   - Tipo de conteúdo: `application/json`
   - Corpo (use o botão **+** para inserir as variáveis da notificação nos lugares marcados):

```
{"token":"COLE_O_TOKEN_AQUI","app":"NOME_DO_APLICATIVO","titulo":"TITULO_DA_NOTIFICACAO","texto":"TEXTO_DA_NOTIFICACAO"}
```
   (no MacroDroid essas três variáveis aparecem como "Nome do aplicativo", "Título da notificação" e "Texto da notificação")
4. Salve e dê um nome (ex.: "Finapp Nubank"). Repita o gatilho para outros bancos na mesma macro (um gatilho por app).

## Passo 3 · não deixar o Android "dormir" o MacroDroid
Configurações do Android → Apps → MacroDroid → Bateria → **Sem restrições** (ou "Nunca suspender"). Sem isso, algumas notificações podem não ser enviadas.

## Passo 4 · testar
Faça uma compra pequena (ou use o botão de testar da macro). Em segundos o bot manda: "📱 Notificação do Nubank: … Confira abaixo antes de confirmar." Toque em **Confirmar**.

## Como funciona o reconhecimento
- O cartão é escolhido pelo nome do app (app "Nubank" → cartão que tem "Nubank" no nome; com mais de um, o da pessoa dona do token). Se não tiver certeza, o bot pergunta qual cartão.
- Notificações que não são compra (Pix, recusada, estorno, fatura) são ignoradas.
- A mesma notificação enviada duas vezes não duplica o lançamento.
- Quando a fatura for importada depois, o app reconhece a compra e não lança de novo.
