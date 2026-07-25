# Publicacao gratuita do sistema

O caminho gratuito mais simples para este projeto e:

1. Render Free para rodar o Node.js com Socket.IO.
2. Supabase Free para banco PostgreSQL quando o sistema precisar guardar dados com seguranca online.

## Estado atual

O projeto ja foi preparado para ficar mais seguro online:

- JWT nas sessoes.
- Rotas protegidas por perfil.
- Eventos Socket.IO protegidos por perfil.
- Senhas com bcrypt.
- CORS configuravel por `ALLOWED_ORIGIN`.
- Limpeza da fila limitada ao dia atual.
- `DATA_DIR` e `DB_FILE` configuraveis por ambiente.

O banco atual ainda e JSON local. Ele funciona bem em rede local, mas nao e ideal para hospedagem gratuita, porque muitos provedores gratuitos usam disco efemero.

## Render Free

Configuracao sugerida:

- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variables:
  - `JWT_SECRET`
  - `SESSION_TTL=8h`
  - `BUSINESS_TIME_ZONE=America/Fortaleza`
  - `ALLOWED_ORIGIN=https://seu-app.onrender.com`
  - `PANEL_TOKEN=um-token-forte-para-a-tv`

Observacao: no plano gratuito, o servico pode "dormir" apos um tempo sem uso e acordar com atraso no primeiro acesso.

## Supabase Free

Para dados permanentes online, o proximo passo recomendado e trocar `data/database.json` por PostgreSQL no Supabase.

Tabelas sugeridas:

- `users`
- `lawyers`
- `appointments`

Variavel futura:

```env
DATABASE_URL=postgresql://usuario:senha@host:5432/postgres
```

## Checklist antes de abrir para clientes

- Definir `JWT_SECRET` forte.
- Definir `ALLOWED_ORIGIN` com o dominio real.
- Se o painel da TV ficar online, definir `PANEL_TOKEN` e abrir a TV com `/painel.html?token=...`.
- Trocar todas as senhas padrao.
- Usar banco permanente.
- Fazer backup dos dados.
- Evitar observacoes sensiveis em texto livre.
