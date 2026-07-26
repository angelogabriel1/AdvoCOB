# ⚖️ COB Advogados - Sistema de Gestão de Atendimento e Fila em Rede Local

Sistema web em tempo real desenvolvido para gestão de agendamentos, fila de espera e atendimento a clientes de bancas de advocacia. O sistema opera 100% em **Rede Local (LAN)** utilizando **WebSockets**, promovendo a comunicação instantânea entre a Recepcionista, os Advogados e o Painel da Sala de Espera.

---

## 🌟 Principais Funcionalidades

### 🏢 Posto da Recepcionista (`/recepcao.html`)
- **Agendamento Presencial e Futuro**: Cadastro rápido de clientes com seleção de data (`YYYY-MM-DD`), horário, advogado e observações.
- **Validação Anti-Conflito (Anti-Duplo Agendamento)**: Bloqueia o agendamento de dois clientes para o mesmo advogado no mesmo dia e horário.
- **Notificação de Conclusão**: Aviso sonoro e alerta em pop-up assim que o advogado encerra a consulta ("Chamar próximo cliente do Dr. X").
- **📱 Lembrete via WhatsApp (1-Clique)**: Botão direto para enviar mensagem de confirmação pré-formatada para o cliente pelo WhatsApp Web/App.

### ⚖️ Painel do Advogado (`/advogado.html`)
- **Fila Exclusiva**: Exibe apenas os clientes atribuídos ao advogado logado.
- **Campainha Sonora na Tela**: Notificação em tempo real com aviso sonoro metálico e pop-up em destaque quando o cliente for chamado ou agendado.
- **Cronômetro em Tempo Real**: Card com contagem progressiva do tempo da consulta ativa.
- **Botão Finalizar Atendimento**: Conclui o atendimento e notifica a recepção no mesmo segundo.

### ⚙️ Painel do Administrador (`/admin.html`)
- **Gestão de Advogados**: Cadastro, edição de salas, especialidades e exclusão de profissionais.
- **Edição Completa de Contas**: Alteração de nomes, usuários (`username`), salas e senhas de qualquer conta (incluindo o próprio perfil de Admin).
- **Redefinição de Senhas**: Reset de senhas para padrão com exigência de nova troca pelo usuário.

### 📅 Agenda em Calendário Interativo (`/agenda.html`)
- **Navegação Mensal**: Calendário interativo com filtros por advogado específico ou banca geral.
- **Detalhamento do Dia**: Clique em qualquer dia para abrir a lista de atendimentos salvos, horários e lembretes.

### 📺 Painel da Sala de Espera / TV (`/painel.html`)
- **Chamada em Tela Cheia**: Anúncio em grande formato para Smart TVs ou monitores da recepção.
- **Síntese de Voz (TTS)**: Anúncio por áudio sintetizado em português (*"Atenção: Cliente João Silva, por favor dirija-se à Sala 01 com o Doutor Carlos Eduardo"*).

### ☀️ / 🌙 Alternador de Tema (Light Mode & Dark Mode)
- Suporte a tema escuro nobre (Vinho Bordo e Obsidian) e tema claro nítido (Off-White e Vinho Bordo) com memorização no navegador.

---

## 🔑 Credenciais Padrão (Primeiro Acesso)

| Perfil / Função | Usuário de Login | Senha Inicial |
| :--- | :--- | :--- |
| **Administrador** | `admin` | `123456` |
| **Recepcionista** | `recepcao` | `123456` |
| **Dr. Carlos Eduardo** | `dr.carlos` | `123456` |
| **Dra. Ana Paula** | `dra.ana` | `123456` |
| **Dr. Roberto Silva** | `dr.roberto` | `123456` |

> 🔒 **Troca de Senha Obrigatória**: No primeiro login com qualquer conta padrão, o sistema exige que o usuário cadastre sua nova senha pessoal.

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js, Express, Socket.IO, Cors.
- **Frontend**: HTML5, Vanilla CSS3 (Custom Properties / CSS Variables), JavaScript ES6+, Web Audio API (Sintetizador Nativo de Campainhas), Web Speech API (Síntese de Voz TTS).
- **Persistência**: Banco de dados JSON local em arquivo (`data/database.json`).

---

## 💻 Como Executar o Projeto

### Pré-requisitos
- [Node.js](https://nodejs.org/) instalado (versão 16 ou superior).

### Passo a Passo

1. **Clonar o Repositório**:
   ```bash
   git clone https://github.com/angelogabriel1/AdvocaciaCOB.git
   cd AdvocaciaCOB
   ```

2. **Instalar Dependências**:
   ```bash
   npm install
   ```

3. **Iniciar o Servidor**:
   ```bash
   npm start
   ```

4. **Acessar a Aplicação**:
   - **Local no Servidor**: [http://localhost:3000](http://localhost:3000)
   - **Dispositivos na Rede Local (Outros PCs / Tablets / TV)**:
     - Digite o endereço IP exibido no terminal (exemplo: `http://192.168.3.10:3000`).

---

## 🛡️ Segurança e Privacidade de Dados

O arquivo `data/database.json` está incluído no `.gitignore` para garantir que dados confidenciais de clientes do escritório nunca sejam expostos em repositórios públicos. Ao clonar o projeto, o servidor criará automaticamente a estrutura inicial segura a partir do template `data/database.json.example`.

---

## 📄 Licença

Desenvolvido por Angelo e Ivan para **COB Advogados (Cavalcanti, Oliveira & Batista Advogados)**. Todos os direitos reservados.

---

## Backup, auditoria e saude do sistema

- O painel `/admin.html` possui uma area de backup completo em JSON com advogados, usuarios, agendamentos, historico e auditoria.
- A restauracao sempre funciona em modo mesclagem: adiciona apenas informacoes novas e preserva o que ja esta cadastrado no servidor.
- Antes de restaurar, o arquivo e validado e o sistema mostra quantos itens serao adicionados ou ignorados por duplicidade.
- Acoes criticas sao registradas em auditoria: exportar/restaurar backup, alterar usuario, resetar senha, excluir advogado e movimentacoes de atendimentos.
- Acoes criticas exigem usuario listado em `SUPERADMIN_USERNAMES` no ambiente. Por padrao, o usuario `admin` e o superadmin.
- O servidor cria backups automaticos em `data/backups` quando `AUTO_BACKUP_ENABLED=true`. Em hospedagem gratuita, use tambem o download manual porque disco local pode ser temporario.
- O endpoint `/api/health` retorna status do servidor, banco, contadores e ultimo backup automatico.

### Variaveis uteis

```env
SUPERADMIN_USERNAMES=admin
AUTO_BACKUP_ENABLED=true
AUTO_BACKUP_INTERVAL_HOURS=24
AUTO_BACKUP_RETAIN=14
BACKUP_DIR=./data/backups
```

### Supabase

O app segue usando `app_state` para compatibilidade com dados ja existentes. O arquivo `supabase-schema.sql` tambem deixa tabelas relacionais preparadas (`users`, `lawyers`, `appointments`, `appointment_history`, `audit_logs`) para uma migracao futura controlada.
