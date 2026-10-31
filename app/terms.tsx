import { LegalDocument } from '@/components/LegalDocument';
import { TERMS } from '@/lib/legal';

export default function TermsScreen() {
  return <LegalDocument title="Termos de Serviço" sections={TERMS} />;
}
