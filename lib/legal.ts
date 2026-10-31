// Termos de Serviço e Política de Privacidade do NestKeep (RASCUNHO para um advogado rever; ver docs/legal/).
// Os textos descrevem o que a app faz hoje. Se a app mudar (novos dados, novos fornecedores), estes textos mudam também.
// Os dados da empresa e o contacto ainda não existem: preencher aqui (e só aqui).
export const LEGAL = {
  controller: '[nome ou empresa por definir]',
  contactEmail: '[e-mail de contacto por definir]',
  updated: '31 de outubro de 2026',
};

export type LegalSection = { title: string; paragraphs?: string[]; bullets?: string[] };

export const TERMS: LegalSection[] = [
  {
    title: 'Em resumo',
    bullets: [
      'O NestKeep ajuda a organizar a casa. É para maiores de 18 anos e, por agora, é gratuito.',
      'O que registas numa casa partilhada é visto pelas pessoas dessa casa; o que é pessoal, só tu vês.',
      'As sugestões de IA são propostas: tu confirmas e elas podem errar. Não são aconselhamento médico nem nutricional.',
      'Podes apagar a tua conta quando quiseres, na própria app.',
      'Isto é um resumo. Os pontos abaixo é que contam.',
    ],
  },
  {
    title: '1. O que é o NestKeep',
    paragraphs: [
      `O NestKeep é uma aplicação para organizar a casa: tarefas, produtos e stock, lista de compras, refeições, despesas e lembretes. É disponibilizada por ${LEGAL.controller} («nós»). Ao usar a app, aceitas estes Termos.`,
    ],
  },
  {
    title: '2. Quem pode usar',
    paragraphs: [
      'A app destina-se a maiores de 18 anos. As crianças não têm conta. Podes indicar quantas crianças vivem em casa, só em números por faixa etária, sem nomes nem datas de nascimento.',
    ],
  },
  {
    title: '3. A tua conta',
    paragraphs: [
      'Podes começar sem registo, com uma conta anónima. Se perderes o telemóvel sem teres protegido a conta, não conseguimos recuperar a tua casa. Por isso aconselhamos a proteger a conta com e-mail e palavra-passe, ou com Google ou Apple.',
      'És responsável pela atividade na tua conta e por guardar a tua palavra-passe. Se achares que alguém usou a tua conta sem autorização, avisa-nos.',
    ],
  },
  {
    title: '4. Casas partilhadas',
    paragraphs: [
      'Quem cria uma casa fica administrador e pode convidar outras pessoas com um código. O que registas numa casa partilhada (tarefas, produtos, compras, despesas partilhadas, refeições) é visto pelas pessoas dessa casa.',
      'As tarefas pessoais, as despesas «só minhas» e o banco de horas são só teus: as outras pessoas da casa não os veem. Podes sair de uma casa quando quiseres.',
    ],
  },
  {
    title: '5. Sugestões e inteligência artificial',
    paragraphs: [
      'Parte da app usa inteligência artificial e cálculos automáticos: ler talões, sugerir refeições e planos da semana, explicar despesas e estimar validades. São propostas. Tu confirmas antes de qualquer alteração, e elas podem estar erradas.',
      'Nada disto substitui aconselhamento médico, nutricional, de segurança alimentar ou financeiro.',
    ],
    bullets: [
      'Alergias e restrições: confirma sempre os ingredientes e os rótulos. Não garantimos que uma sugestão seja segura para ti.',
      'Bebés e crianças: a app evita alguns alimentos, mas não é um guia de alimentação infantil. Em caso de dúvida, fala com o pediatra.',
      'Validades: são estimativas. Vale sempre a data da embalagem e, em caso de dúvida, não consumas.',
      'Preços e custos: vêm dos talões que registas e são só indicativos.',
    ],
  },
  {
    title: '6. Uso aceitável',
    paragraphs: ['Não podes:'],
    bullets: [
      'usar a app para fins ilegais ou para prejudicar outras pessoas;',
      'tentar aceder a dados de outras casas ou contornar as regras de acesso;',
      'sobrecarregar ou atacar o serviço, nem tentar extrair o código ou os dados em massa;',
      'registar conteúdo que viole direitos de terceiros.',
    ],
  },
  {
    title: '7. O teu conteúdo e a nossa propriedade',
    paragraphs: [
      'Os dados que registas continuam a ser teus. Damos-nos apenas a permissão de os guardar e tratar para te prestar o serviço, como explica a Política de Privacidade.',
      'A app, o nome, o logótipo, o design e o código pertencem-nos ou aos nossos licenciadores. Damos-te uma licença pessoal, não exclusiva e revogável para usar a app para fins pessoais; não a podes copiar, vender ou alterar.',
    ],
  },
  {
    title: '8. Serviços de terceiros',
    paragraphs: [
      'A app usa serviços de outras empresas (entrar com Google ou Apple, notificações, e-mails, inteligência artificial e alojamento). Cada um tem as suas próprias regras, e não controlamos a sua disponibilidade. A Política de Privacidade diz quais são e que dados lhes chegam.',
    ],
  },
  {
    title: '9. Disponibilidade e alterações ao serviço',
    paragraphs: [
      'Fazemos um esforço razoável para o serviço funcionar, mas pode haver falhas ou manutenção. Podemos melhorar, mudar ou retirar funcionalidades. Se a mudança for importante, avisamos na app.',
    ],
  },
  {
    title: '10. Preço',
    paragraphs: [
      'Neste momento a app é gratuita. Se vierem a existir funcionalidades pagas, dizemos antes e nada é cobrado sem o teu acordo.',
    ],
  },
  {
    title: '11. Responsabilidade',
    paragraphs: [
      'Na medida permitida pela lei, não respondemos por danos indiretos nem pela perda de dados causada por falhas fora do nosso controlo. Isto não afasta os teus direitos como consumidor, nem a responsabilidade que a lei não permite excluir.',
    ],
  },
  {
    title: '12. Terminar',
    paragraphs: [
      'Podes deixar de usar a app quando quiseres. Para apagar a conta e os teus dados, vai a Casa → «Apagar a minha conta». Podemos suspender contas que violem estes Termos, avisando-te sempre que possível.',
    ],
  },
  {
    title: '13. Alterações aos Termos',
    paragraphs: [
      'Podemos atualizar estes Termos. Avisamos na app quando houver mudanças importantes. Se continuares a usar a app depois do aviso, aceitas a nova versão; se não concordares, deixa de a usar e apaga a conta.',
    ],
  },
  {
    title: '14. Lei aplicável e litígios',
    paragraphs: [
      'Aplica-se a lei portuguesa. Como consumidor, podes recorrer às entidades de resolução alternativa de litígios de consumo e aos tribunais portugueses.',
    ],
  },
  {
    title: '15. Disposições gerais',
    paragraphs: [
      'Estes Termos e a Política de Privacidade são o acordo completo entre ti e nós sobre a app. Se uma parte for considerada inválida, as restantes continuam a valer.',
    ],
  },
  { title: '16. Contacto', paragraphs: [`${LEGAL.contactEmail}`] },
];

export const PRIVACY: LegalSection[] = [
  {
    title: 'Em resumo',
    bullets: [
      'Guardamos o que registas na app (casa, tarefas, produtos, compras, despesas) e o que precisas para entrar.',
      'Não vendemos dados, não temos publicidade e a app não usa cookies nem ferramentas de análise.',
      'A inteligência artificial recebe só o necessário (por exemplo a foto do talão) e nunca o teu nome nem o teu e-mail.',
      'As alergias que escreveres são dados de saúde: usamo-las só para filtrar refeições.',
      'Podes apagar a tua conta na app, e tens os direitos do RGPD.',
    ],
  },
  {
    title: '1. Quem é o responsável',
    paragraphs: [
      `${LEGAL.controller} é o responsável pelo tratamento dos teus dados pessoais no NestKeep. Contacto: ${LEGAL.contactEmail}.`,
      'Esta Política explica que dados tratamos, para quê e que direitos tens, segundo o Regulamento Geral sobre a Proteção de Dados (RGPD).',
    ],
  },
  {
    title: '2. Que dados tratamos',
    bullets: [
      'Conta: um identificador da conta; o e-mail (se protegeres a conta ou entrares com Google ou Apple, também o nome que esses serviços partilham); e o nome que escolhes mostrar na casa.',
      'Casa: o nome da casa, as pessoas que a integram, tarefas e histórico do que foi feito, produtos e stock, listas de compras, receitas favoritas e planos da semana.',
      'Perfil da casa: tipo de casa, espaço exterior, animais e quantas pessoas vivem lá por faixa etária. Só números: nunca nomes nem datas de nascimento.',
      'Perfil de cozinha: horários das refeições, orçamento, preferências, equipamento e restrições alimentares ou alergias.',
      'Dinheiro: despesas, orçamentos e os dados lidos dos talões (loja, data, linhas e preços).',
      'Parte pessoal: tarefas pessoais e banco de horas. Só tu os vês.',
      'Lembretes: o código do teu telemóvel para receber notificações e as horas que escolheres.',
      'Registos técnicos mínimos, como o número de pedidos de IA, para evitar abusos e controlar custos.',
    ],
    paragraphs: [
      'Não recolhemos a tua localização nem os teus contactos. A app não usa cookies nem ferramentas de análise ou publicidade, e não vendemos dados.',
    ],
  },
  {
    title: '3. Câmara e fotos',
    paragraphs: [
      'A app só usa a câmara ou a galeria quando escolhes ler um talão. A foto é enviada para ser lida pela inteligência artificial (ponto 6) e é apagada do nosso armazenamento depois da leitura; guardamos só o que foi lido (loja, data, linhas, preços). Não acedemos a mais nenhuma foto.',
    ],
  },
  {
    title: '4. Para quê e com que fundamento',
    bullets: [
      'Prestar o serviço que pediste (contrato): guardar a tua casa, gerar tarefas, listas e lembretes.',
      'Consentimento: notificações no telemóvel e os dados de saúde que escreveres (ver ponto 5). Podes retirá-lo quando quiseres.',
      'Interesse legítimo: segurança, prevenção de abuso e limites de utilização da IA.',
      'Cumprimento da lei, quando for exigido.',
    ],
  },
  {
    title: '5. Alergias e restrições alimentares (dados de saúde)',
    paragraphs: [
      'As alergias e restrições que escreveres no Perfil de cozinha são dados de saúde. Só as usamos para filtrar as sugestões de refeições, e tratamo-las com o teu consentimento explícito, que dás ao escrevê-las. Podes apagá-las quando quiseres em Casa → Perfil de cozinha.',
    ],
  },
  {
    title: '6. Inteligência artificial',
    paragraphs: [
      'Usamos a API Claude, da Anthropic, para ler talões, sugerir refeições, montar o plano semanal e explicar despesas. Enviamos só o necessário: a foto do talão; a lista de produtos em stock, o perfil de cozinha e o número de pessoas por idade; e números já calculados da análise de despesas. Não enviamos o teu nome nem o teu e-mail.',
      'A IA só propõe: tu confirmas antes de qualquer alteração.',
    ],
  },
  {
    title: '7. Com quem partilhamos',
    paragraphs: ['Usamos fornecedores que tratam dados em nosso nome:'],
    bullets: [
      'Supabase: base de dados, contas, armazenamento e funções do servidor (servidores na União Europeia).',
      'Anthropic: inteligência artificial (ponto 6).',
      'Expo e Google (Firebase): envio das notificações para o telemóvel.',
      'Resend: envio dos e-mails da conta (recuperar palavra-passe, confirmar e-mail).',
      'Google e Apple: só se escolheres entrar com essas contas.',
      'As outras pessoas da tua casa veem o que é partilhado (ponto 4 dos Termos).',
      'Autoridades, se a lei ou uma decisão judicial o exigir.',
    ],
  },
  {
    title: '8. Transferências para fora da UE',
    paragraphs: [
      'Alguns destes serviços, como a IA e as notificações, podem tratar dados fora da União Europeia. Nesses casos aplicam-se as garantias previstas no RGPD para as transferências.',
    ],
  },
  {
    title: '9. Apagar a conta e quanto tempo guardamos',
    paragraphs: [
      'Guardamos os teus dados enquanto tiveres conta. Para a apagar, vai a Casa → «Apagar a minha conta». Acontece isto:',
    ],
    bullets: [
      'As casas onde és a única pessoa são apagadas, com tudo o que têm.',
      'Nas casas com mais pessoas, saís e a administração passa para outra pessoa. O que registaste fica para elas, sem o teu nome, incluindo as despesas partilhadas que pagaste.',
      'Apagamos o que é só teu: perfil, tarefas pessoais, banco de horas, definições, lembretes, agradecimentos e trocas, e as despesas «só minhas».',
      'O teu e-mail e o acesso à conta deixam de existir.',
      'Os dados podem permanecer nas cópias de segurança do nosso fornecedor até 90 dias depois de apagares a conta, sem serem usados, e a lei pode obrigar-nos a guardar certos registos.',
    ],
  },
  {
    title: '10. Os teus direitos',
    paragraphs: [
      'Tens direito a aceder aos teus dados, corrigi-los, apagá-los, limitar ou opor-te ao tratamento, receber uma cópia (portabilidade) e retirar o consentimento. Muito disto fazes tu na app; para o resto, escreve para o contacto abaixo e respondemos num mês.',
      'Se achares que não tratamos bem os teus dados, podes queixar-te à Comissão Nacional de Proteção de Dados (cnpd.pt).',
    ],
  },
  {
    title: '11. Segurança',
    paragraphs: [
      'As comunicações são cifradas. A base de dados tem regras de acesso que fazem com que cada pessoa só veja os dados da sua casa e, nas partes pessoais, só os seus. Nenhum sistema é totalmente seguro, mas trabalhamos para proteger os teus dados.',
    ],
  },
  {
    title: '12. Menores',
    paragraphs: [
      'A app é para maiores de 18 anos. Não criamos contas de crianças nem guardamos os seus nomes ou datas de nascimento; só quantas crianças vivem em casa, por faixa etária.',
    ],
  },
  {
    title: '13. Alterações a esta Política',
    paragraphs: ['Se mudarmos esta Política de forma importante, avisamos na app antes de a mudança se aplicar.'],
  },
  { title: '14. Contacto', paragraphs: [`${LEGAL.contactEmail}`] },
];
