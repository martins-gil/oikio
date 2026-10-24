import { Redirect, useLocalSearchParams } from 'expo-router';

// Ligação direta (…/invite/<código>): abre o ecrã de entrada com o código já preenchido.
// Só funciona em versões reais da app; no Expo Go entra-se pelo ecrã "Tenho um convite".
export default function InviteLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={{ pathname: '/join', params: { code } }} />;
}
