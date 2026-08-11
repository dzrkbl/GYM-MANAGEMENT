-- « Membre depuis » : signupDate représente désormais la PREMIÈRE inscription
-- au club (l'ancienneté). Elle n'est plus jamais modifiée par un renouvellement,
-- contrairement à dateInscription qui marque le début du contrat EN COURS.
-- Rattrapage des dossiers existants : les membres importés ou créés après coup
-- avaient signupDate = date de création du dossier ; la première inscription
-- connue est la date d'inscription du contrat si elle est antérieure.
UPDATE "Member" SET "signupDate" = "dateInscription"
WHERE "dateInscription" IS NOT NULL AND "dateInscription" < "signupDate";
