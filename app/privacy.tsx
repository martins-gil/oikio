import { LegalDocument } from '@/components/LegalDocument';
import { PRIVACY } from '@/lib/legal';

export default function PrivacyScreen() {
  return <LegalDocument title="Política de Privacidade" sections={PRIVACY} />;
}
