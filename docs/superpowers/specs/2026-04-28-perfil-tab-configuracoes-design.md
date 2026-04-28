# Tab "Configurações" no perfil

## Objectivo

Migrar o modal `Editar Perfil` para uma tab visível na página de perfil e adicionar a acção "Terminar Sessão". Foto, nome, email e palavra-passe ficam todos disponíveis sem precisar de abrir um modal.

## Escopo

- `perfil.html`: adicionar tab `Configurações`, painel `#panel-settings` com 4 cards (foto, nome, segurança, terminar sessão), remover `#edit-modal`
- `js/perfil.js`: redirecionar `#edit-profile-btn` para a tab; eliminar `openEditModal` / `closeEditModal`; ligar botão `Terminar Sessão` ao logout existente
- Sem alterações a `data/`, `admin.html`, `js/admin.js` (perfil não é gerido pelo admin)

## Estrutura HTML

Tab adicionada à barra existente:
```html
<button class="profile-tab tab-btn tab-inactive" data-tab="settings">Configurações</button>
```

Painel `#panel-settings` em quatro cards claros (fundo branco, sombra layered, radius 16px) sobre `bg-praia-sand-50`:

1. **Foto de perfil** — preview circular + botão `Escolher foto` (input `#edit-avatar`) + botão `Guardar Foto` (`#edit-photo-btn`). Mantém crop overlay já existente.
2. **Nome de utilizador** — input `#edit-username` + botão `Guardar Nome` (`#edit-username-btn`).
3. **Segurança (email + palavra-passe)** — secção `#edit-security-section` migrada do modal:
   - Email: form (`#edit-email-form`) → estado sucesso (`#edit-email-success`) com reenvio
   - Palavra-passe: bloco `#edit-password-wrap` (oculto para utilizadores OAuth)
4. **Terminar Sessão** — card próprio com ícone `log-out`, título, descrição curta ("Termina a sessão neste dispositivo.") e botão `#sign-out-btn` em estilo destrutivo subtil (border vermelho, texto vermelho, hover fundo vermelho/10).

Visibilidade da tab: igual ao botão "Editar Perfil" — só no perfil próprio.

## Comportamento

- Clique em `#edit-profile-btn` (hero) → `switchTab('settings')` + scroll suave até à barra de tabs
- Clique em `#sign-out-btn` → reutiliza logout existente em `js/auth.js` (verificar nome exacto na implementação) → redirect `index.html`
- Toda a lógica de `saveProfilePhoto`, `saveProfileUsername`, `saveProfileEmail`, `saveProfilePassword`, `resendEmailChange`, `cancelEmailChange`, crop overlay, reenvio com countdown — **mantida sem alterações** (IDs preservados)

## Estilo

- Cards claros (fundo branco) — não os cards escuros do hero. Mesmo padrão visual usado nos painéis de Encomendas e Comentários
- "Terminar Sessão" como card distinto, não link discreto
- Tipografia, ícones (Lucide) e botões seguem o sistema existente (`btn-primary`, `font-display`, etc.)
- PT-PT, tratamento por "você"
- Sem em-dash nos textos do site (usar `|`, `·`, `:`, `,`)

## Acessibilidade

- Tab acessível por teclado (já garantido pelo padrão `.profile-tab` existente)
- Inputs com labels visuais e `aria-` apropriado
- Botão `Terminar Sessão` com confirmação visual (toast ou estado de loading) antes do redirect

## Não-objectivos

- Não alterar a estrutura de dados de utilizador
- Não tocar em `admin.html` / `js/admin.js`
- Não alterar o crop overlay ou a lógica de upload de avatar
- Não adicionar novas opções (notificações, privacidade adicional, eliminar conta) — fora do escopo
