## Objetivo

Adicionar a animação sliding login/signup nas telas `/login` e `/signup`, mantendo 100% do funcionamento atual (Supabase auth, TOTP/MFA, forgot password, signup com nome).

## Componente novo

`src/components/auth/auth-slider.tsx` — componente único que renderiza ambos os formulários lado a lado com o efeito de painel deslizante (toggle box azul) do snippet enviado.

**Adaptações ao snippet original:**

1. **Design tokens em vez de cores hard-coded.** Substituir `#7494ec`, `#fff`, `#eee`, `#333`, `#888`, `#ccc` por tokens semânticos do `src/styles.css` (`--primary`, `--background`, `--muted`, `--foreground`, `--muted-foreground`, `--border`). A animação sliding fica intacta; só a paleta muda para combinar com o design system do app.
2. **Ícones Lucide reais.** O snippet usa `<i>` placeholders; trocar por `<User />`, `<Mail />`, `<Lock />` de `lucide-react` posicionados absolutamente dentro de cada `.input-box`.
3. **Sem fonte Poppins.** Remover o `@import` de Google Fonts e a regra `font-family: "Poppins"`. Usar a fonte do projeto (Inter já configurada).
4. **Sem ícones sociais funcionais.** O projeto não tem OAuth implementado. Remover a seção `social-icons` e o texto "or login with social platforms" — não vamos adicionar UI que não funciona.
5. **Scoped CSS.** Em vez de `<style jsx>` global (não suportado), usar um `<style>` tag local com as classes prefixadas (`.auth-slider-container`, `.auth-slider-form-box` etc.) para não colidir com nada do app.

## Integração com lógica existente

O componente recebe props para delegar a lógica real (que já existe em `src/routes/login.tsx` e `src/routes/signup.tsx`):

```ts
type AuthSliderProps = {
  initialMode: "login" | "register";
  onLogin: (email, password) => Promise<void>;
  onRegister: (name, email, password) => Promise<void>;
  loading: boolean;
  forgotPasswordHref: string;
};
```

A TOTP step do login **não** entra no painel deslizante (é um fluxo de 2ª etapa). Quando `supabase.auth.mfa` exigir aal2, a rota `/login` esconde o `<AuthSlider>` e renderiza o `AuthShell` atual com o `InputOTP` — mesmo comportamento de hoje, só que entrando depois do submit do painel azul.

## Mudanças nas rotas

### `src/routes/login.tsx`
- Manter toda a lógica atual (`onSubmitCredentials`, MFA, `onSubmitTotp`, redirecionamento `/app`, redirect se já logado).
- Substituir o `<AuthShell>` do estado `step === "credentials"` por `<AuthSlider initialMode="login" onLogin={...} onRegister={handleRegister} loading={loading} forgotPasswordHref="/forgot-password" />`.
- Step `totp` continua usando `AuthShell` exatamente como hoje.
- Adicionar `handleRegister` que chama `supabase.auth.signUp` (mesma lógica do `signup.tsx`) e dá `toast.success` + `navigate({ to: "/login" })` (para forçar verificação de email antes do login).

### `src/routes/signup.tsx`
- Manter rota e SEO (`head`).
- Renderizar `<AuthSlider initialMode="register" ... />` com as mesmas duas handlers (login e signup), para que quem cair em `/signup` veja o painel já deslizado.
- Mantém validações Zod existentes (`schema` para signup, `credentialsSchema` para login).

### `src/routes/forgot-password.tsx` e `src/routes/reset-password.tsx`
- **Sem mudanças.** Continuam usando `AuthShell` como hoje. O link "Forgot Password?" dentro do `AuthSlider` aponta para `/forgot-password`.

## O que NÃO muda

- `src/hooks/use-auth.tsx`, Supabase client, RLS, TOTP/MFA, validações Zod (`credentialsSchema`, signup `schema`), redirect logic, toasts, mensagens de erro, `AuthShell` (usado por forgot/reset/TOTP).
- Design system (`src/styles.css`) — o componente consome os tokens existentes.

## Arquivos tocados

- **novo:** `src/components/auth/auth-slider.tsx`
- **editado:** `src/routes/login.tsx`
- **editado:** `src/routes/signup.tsx`

## Detalhes técnicos

- Tipos: `useState<boolean>` para `isActive`; no mount, se `initialMode === "register"`, setar `isActive = true`.
- O `AuthSlider` é client-only (usa `useState`), igual aos forms atuais — sem SSR loader.
- CSS scoped via tag `<style>` no componente. As classes usam prefixo `as-` (ex.: `.as-container`, `.as-form-box`) para evitar colisão. Media queries do snippet ficam preservadas (650px, 400px).
- Acessibilidade: `label` para cada input (visually-hidden via `sr-only`), `type="submit"` nos botões, `autoComplete` correto em cada campo (email, current-password, new-password, name).
- O botão "Register" / "Login" do painel azul faz `setIsActive(true/false)`. Não navega entre rotas — é só toggle visual; se o usuário entrou em `/login`, fica em `/login` (URL não muda).
