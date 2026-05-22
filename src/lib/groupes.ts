export const getGroupeLabel = (value: string): string => {
  const GROUPES: Record<string, string> = {
    'KARATE_GR1': 'Karaté Gr. 1',
    'KARATE_GR2': 'Karaté Gr. 2',
    'JUDO_GR1':   'Judo Gr. 1',
    'JUDO_GR2':   'Judo Gr. 2',
    'JUDO_GR3':   'Judo Gr. 3',
    'NINJAS_GR1': 'Ninjas Gr. 1',
    'NINJAS_GR2': 'Ninjas Gr. 2',
    'MENSUEL':    'Mensuel',
  };
  return GROUPES[value] ?? value;
};
