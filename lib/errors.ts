// Mensagens de «falta aplicar a migração» só fazem sentido para quem desenvolve; quem usa a app vê um texto simples.
export const devHint = (devText: string): string => (__DEV__ ? devText : 'Esta funcionalidade está a ser atualizada. Tenta outra vez daqui a pouco.');
