# Recuperar a conta ("Esqueci a palavra-passe")

A app pede o e-mail, o Supabase envia um **código** por e-mail e a pessoa escreve-o na app para escolher uma palavra-passe nova
(`resetPasswordForEmail` → `verifyOtp(type: 'recovery')` → `updateUser({ password })`).

## Configuração única no painel do Supabase
O e-mail de recuperação traz, por defeito, só uma ligação. Tem de trazer também o código:
1. **Authentication → Emails → Templates → Reset password** (ou "Email Templates").
2. Substituir o corpo por algo como:
   ```html
   <h2>Recuperar a tua conta NestKeep</h2>
   <p>O teu código é: <strong>{{ .Token }}</strong></p>
   <p>Escreve-o na app para escolheres uma palavra-passe nova. Se não pediste, ignora este e-mail.</p>
   ```
3. Guardar. (O comprimento do código vê-se em Authentication → Providers → Email → "Email OTP Length"; a app aceita 6 a 10 algarismos.)

## Limites
O envio de e-mails do próprio Supabase é limitado (poucos por hora) e serve só para testes. Antes de lançar a app, configurar um
SMTP próprio em Authentication → SMTP Settings.
