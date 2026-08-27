import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { calculerMontantFinal, calculerFinContrat, dateAMidi, ajouterMoisISO, TARIFS } from '../lib/tarifs';
import { activerSiPremierPaiement, normalizeMethodePaiement } from '../lib/paiements';
import { sendRecuVersementBackground } from '../lib/recus';
import { sendEmailBackground, htmlCourriel } from '../lib/mailer';
import { contenuBienvenue } from '../lib/bienvenue';
import { estKarate } from '../lib/katas';
import { logAudit } from '../lib/audit';
import { porteeStaff, clauseSectionsPortee, membreDansPortee } from '../lib/portee';
import { genererFactures } from '../lib/factures';

const router = Router();

const versementInputSchema = z.object({
  id: z.string().optional(),
  numeroVersement: z.number(),
  montant: z.number(),
  datePrevue: z.string(), // YYYY-MM-DD
  datePaiement: z.string().optional().nullable(),
  methodePaiement: z.enum(['CASH', 'VIREMENT', 'CHEQUE', 'CARTE']).optional().nullable(),
  note: z.string().optional().nullable(),
});

const memberSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  dob: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(), // Allow nullable and don't enforce strict single email validator so multiple separated by semicolon works
  sections: z.array(
    z.union([
      z.string(),
      z.object({ section: z.string(), belt: z.string().optional().nullable() })
    ])
  ).min(1, 'Au moins une section est requise'),
  parentName: z.string().optional().nullable(),
  parentPhone: z.string().optional().nullable(),
  // Destinataire prioritaire des rappels et reçus (plusieurs adresses possibles,
  // séparées par « ; »).
  parentEmail: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  currentBelt: z.string().optional().nullable(),
  status: z.enum(['ACTIF', 'INACTIF', 'EN_ATTENTE']).default('ACTIF'),

  poids: z.number().optional().nullable(),
  // Début du contrat EN COURS (renouvelé à chaque renouvellement).
  dateInscription: z.string().optional().nullable(),
  // Première inscription au club (ancienneté) — ne bouge pas au renouvellement.
  membreDepuis: z.string().optional().nullable(),
  finContrat: z.string().optional().nullable(),
  plan: z.enum(['TRIMESTRIEL', 'ANNUEL']).optional().nullable(),
  prixBase: z.number().optional().nullable(),
  rabaisFamille: z.boolean().optional().default(false),
  membreFamilleId: z.string().optional().nullable(),
  rabaisCustomPct: z.number().optional().nullable(),
  raisonRabaisCustom: z.string().optional().nullable(),
  montantFinal: z.number().optional().nullable(),

  referePar: z.string().optional().nullable(),
  rabaisReferentPct: z.number().optional().nullable(),
  rabaisReferentApplique: z.boolean().optional().default(false),

  versements: z.array(versementInputSchema).optional(),
});

// GET /api/membres
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { section, status } = req.query;

    // Portée par discipline : un coach/responsable voit TOUS les groupes de
    // ses sports (sections attitrées, séparées par des virgules sur le compte) ;
    // l'admin voit tout ; un staff sans section attitrée ne voit rien.
    const portee = await porteeStaff(req.user!);
    const demande = section ? String(section) : '';
    let clauseSections: any | null = null;
    if (portee.admin) {
      if (demande) clauseSections = { section: demande };
    } else {
      const demandeOk = demande && membreDansPortee([{ section: demande }], portee);
      clauseSections = demandeOk ? { section: demande } : clauseSectionsPortee(portee);
    }

    const members = await prisma.member.findMany({
      where: {
        ...(status ? { status: status as string } : { status: { not: 'INACTIF' } }),
        ...(clauseSections ? { sections: { some: clauseSections } } : {}),
      },
      include: { sections: true, versements: true },
      orderBy: { lastName: 'asc' },
    });

    // Dernière présence réelle (pointage PRESENT le plus récent) : une seule
    // requête groupée pour toute la liste, pas une par membre.
    const dernieres = await prisma.attendance.groupBy({
      by: ['memberId'],
      where: { status: 'PRESENT', memberId: { in: members.map((m) => m.id) } },
      _max: { date: true },
    });
    const presenceParMembre = new Map(dernieres.map((d) => [d.memberId, d._max.date]));
    const enrichis = members.map((m) => ({
      ...m,
      dernierePresence: presenceParMembre.get(m.id) ?? null,
    }));

    return sendSuccess(res, enrichis);
  } catch (error) {
    return sendError(res, 'Erreur de récupération des membres', 500);
  }
});

// POST /api/membres
router.post('/', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = memberSchema.parse(req.body);

    let prixBase = data.prixBase;
    let finContrat = data.finContrat ? dateAMidi(data.finContrat) : null;
    let montantFinal = data.montantFinal;

    if (data.plan) {
      prixBase = (data.prixBase !== null && data.prixBase !== undefined && data.prixBase !== 0)
        ? data.prixBase
        : (TARIFS[data.plan]?.base ?? 0);
      if (data.dateInscription) {
        finContrat = calculerFinContrat(new Date(data.dateInscription), data.plan);
      }
      montantFinal = calculerMontantFinal({
        plan: data.plan,
        rabaisFamille: !!data.rabaisFamille,
        rabaisCustomPct: data.rabaisCustomPct,
        prixBase: prixBase,
      });
    }

    const newMember = await prisma.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          dateOfBirth: data.dob ? dateAMidi(data.dob) : null,
          gender: data.gender,
          phone: data.phone,
          email: data.email,
          parentName: data.parentName,
          parentPhone: data.parentPhone,
          parentEmail: data.parentEmail,
          notes: data.notes,
          currentBelt: data.currentBelt,
          status: data.status,
          sections: {
            create: data.sections.map((sec: any) => 
              typeof sec === 'string' ? { section: sec } : { section: sec.section, belt: sec.belt || "Blanche" }
            )
          },
          poids: data.poids,
          dateInscription: data.dateInscription ? dateAMidi(data.dateInscription) : null,
          // À la création, l'ancienneté démarre avec le premier contrat.
          signupDate: data.membreDepuis
            ? dateAMidi(data.membreDepuis)
            : (data.dateInscription ? dateAMidi(data.dateInscription) : undefined),
          finContrat: finContrat,
          plan: data.plan,
          prixBase: prixBase,
          rabaisFamille: data.rabaisFamille,
          membreFamilleId: data.membreFamilleId,
          rabaisCustomPct: data.rabaisCustomPct,
          raisonRabaisCustom: data.raisonRabaisCustom,
          montantFinal: montantFinal,
          referePar: data.referePar,
          rabaisReferentPct: data.rabaisReferentPct,
          rabaisReferentApplique: data.rabaisReferentApplique,
          versements: data.versements ? {
            create: data.versements.map((v: any) => ({
              numeroVersement: v.numeroVersement,
              montant: v.montant,
              datePrevue: dateAMidi(v.datePrevue),
              datePaiement: v.datePaiement ? dateAMidi(v.datePaiement) : null,
              methodePaiement: v.methodePaiement,
              note: v.note,
            }))
          } : undefined
        },
        include: { sections: true, versements: true }
      });

      return member;
    });

    // Courriel de bienvenue avec la documentation (non bloquant).
    const dest = newMember.parentEmail || newMember.email;
    if (dest) {
      const karate = newMember.sections?.some((s: any) => estKarate(s.section));
      sendEmailBackground({
        to: dest,
        subject: 'Bienvenue au Centre Sportif de Haute-Performance',
        html: htmlCourriel(contenuBienvenue({ nom: `${newMember.firstName} ${newMember.lastName}`, karate })),
      }, `Courriel de bienvenue (${newMember.firstName} ${newMember.lastName})`);
    }

    logAudit(req, { action: 'CREATE', entity: 'Member', entityId: newMember.id, description: `${newMember.firstName} ${newMember.lastName}` });

    return sendSuccess(res, newMember, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Données invalides', 400, error.issues);
    }
    return sendError(res, 'Erreur de création', 500);
  }
});

// POST /api/membres/factures — factures annuelles par famille.
// Pour les membres cochés : une facture PAR FAMILLE (enfants liés, même
// courriel ou même téléphone de parent), listant tous les montants VERSÉS
// durant l'année civile demandée. Retourne un PDF encodé par famille.
router.post('/factures', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const schema = z.object({
      memberIds: z.array(z.string()).min(1, 'Sélectionnez au moins un membre'),
      annee: z.number().int().min(2020).max(2100),
    });
    const { memberIds, annee } = schema.parse(req.body);

    const factures = await genererFactures(memberIds, annee);
    if (factures.length === 0) return sendError(res, 'Aucun membre trouvé pour cette sélection', 404);

    logAudit(req, {
      action: 'CREATE',
      entity: 'Facture',
      description: `${factures.length} facture(s) ${annee} — ${factures.map((f) => f.membres.join(' + ')).join(' | ')}`,
    });

    return sendSuccess(res, { annee, factures });
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    console.error('Erreur génération factures:', error);
    return sendError(res, 'Erreur lors de la génération des factures', 500);
  }
});

// GET /api/membres/:id
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.params.id },
      include: { sections: true, versements: { orderBy: { numeroVersement: 'asc' } } }
    });

    if (!member) return sendError(res, 'Membre introuvable', 404);

    // Portée par discipline : un coach/responsable n'ouvre que les dossiers de ses sports.
    const portee = await porteeStaff(req.user!);
    if (!portee.admin && !membreDansPortee(member.sections, portee)) {
      return sendError(res, "Ce membre n'appartient pas à votre discipline", 403);
    }

    return sendSuccess(res, member);
  } catch (error) {
    return sendError(res, 'Erreur de récupération', 500);
  }
});

// Les trois clés du renouvellement en cours (R30 garde l'ancienne forme id:date,
// voir sendRenewalReminders). Utilisées par le diagnostic et la réactivation.
function clesRenouvellement(memberId: string, finContrat: Date): string[] {
  const finIso = finContrat.toISOString().slice(0, 10);
  return [`${memberId}:${finIso}`, `${memberId}:${finIso}:R7`, `${memberId}:${finIso}:ECHU`];
}

// GET /api/membres/:id/courriels — diagnostic des courriels automatiques (ADMIN).
// Répond à « pourquoi ce membre ne reçoit rien ? » : destinataire effectif,
// historique des rappels déjà envoyés, et état du renouvellement en cours
// (armé, ou déjà couvert — envoyé pour de vrai OU neutralisé par le muselage
// anti-rattrapage d'un import : les deux laissent la même trace en base).
router.get('/:id/courriels', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const member = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!member) return sendError(res, 'Membre introuvable', 404);

    const destinataire = member.parentEmail || member.email || null;
    const historique = await prisma.reminderLog.findMany({
      where: { memberId: member.id },
      orderBy: { sentAt: 'desc' },
      take: 15,
      select: { type: true, refKey: true, sentAt: true },
    });

    let renouvellement: { etat: 'SANS_CONTRAT' | 'ARME' | 'COUVERT'; etapesCouvertes: string[] } =
      { etat: 'SANS_CONTRAT', etapesCouvertes: [] };
    if (member.finContrat) {
      const cles = clesRenouvellement(member.id, member.finContrat);
      const logs = await prisma.reminderLog.findMany({
        where: { type: 'RENOUVELLEMENT', refKey: { in: cles } },
        select: { refKey: true },
      });
      const etapes = logs.map((l) =>
        l.refKey.endsWith(':ECHU') ? 'ECHU' : l.refKey.endsWith(':R7') ? 'R7' : 'R30');
      renouvellement = { etat: etapes.length > 0 ? 'COUVERT' : 'ARME', etapesCouvertes: etapes };
    }

    return sendSuccess(res, {
      destinataire,
      statut: member.status,
      finContrat: member.finContrat,
      renouvellement,
      historique,
    });
  } catch (error) {
    return sendError(res, 'Erreur lors du diagnostic courriel', 500);
  }
});

// POST /api/membres/:id/reactiver-renouvellement — réarme les rappels de
// renouvellement du contrat EN COURS (ADMIN). Efface les traces R30/R7/ECHU :
// la prochaine tournée renvoie l'étape appropriée. À utiliser quand le
// muselage d'un import a neutralisé un renouvellement qu'on voulait envoyer.
router.post('/:id/reactiver-renouvellement', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const member = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!member) return sendError(res, 'Membre introuvable', 404);
    if (!member.finContrat) return sendError(res, 'Ce membre n\'a pas de fin de contrat définie.', 400);

    const { count } = await prisma.reminderLog.deleteMany({
      where: { type: 'RENOUVELLEMENT', refKey: { in: clesRenouvellement(member.id, member.finContrat) } },
    });
    logAudit(req, {
      action: 'UPDATE', entity: 'Member', entityId: member.id,
      description: `Rappels de renouvellement réarmés (${count} trace(s) effacée(s)) — ${member.firstName} ${member.lastName}`,
    });
    return sendSuccess(res, { ok: true, tracesEffacees: count });
  } catch (error) {
    return sendError(res, 'Erreur lors de la réactivation', 500);
  }
});

// PUT /api/membres/:id
router.put('/:id', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = memberSchema.partial().parse(req.body);
    
    let existingMember: any = null;
    const needsCalculation = (
      data.plan !== undefined ||
      data.dateInscription !== undefined ||
      data.rabaisFamille !== undefined ||
      data.rabaisCustomPct !== undefined
    );

    if (needsCalculation) {
      existingMember = await prisma.member.findUnique({ where: { id: req.params.id } });
    }

    const updateData: any = { ...data };
    
    if (needsCalculation && existingMember) {
      const plan = data.plan !== undefined ? data.plan : existingMember.plan;
      const dateInscriptionStr = data.dateInscription !== undefined ? data.dateInscription : existingMember.dateInscription;
      const rabaisFamille = data.rabaisFamille !== undefined ? data.rabaisFamille : existingMember.rabaisFamille;
      const rabaisCustomPct = data.rabaisCustomPct !== undefined ? data.rabaisCustomPct : existingMember.rabaisCustomPct;

      if (plan) {
        updateData.prixBase = (data.prixBase !== null && data.prixBase !== undefined && data.prixBase !== 0) 
          ? data.prixBase 
          : (existingMember.prixBase !== null && existingMember.prixBase !== undefined && existingMember.prixBase !== 0
              ? existingMember.prixBase
              : (TARIFS[plan]?.base ?? 0));
        
        if (dateInscriptionStr) {
          updateData.finContrat = calculerFinContrat(new Date(dateInscriptionStr), plan);
        }
        
        updateData.montantFinal = calculerMontantFinal({
          plan,
          rabaisFamille: !!rabaisFamille,
          rabaisCustomPct,
          prixBase: updateData.prixBase,
        });
      }
    }

    if (data.dob) {
      updateData.dateOfBirth = dateAMidi(data.dob);
    } else if (data.dob === null) {
      updateData.dateOfBirth = null;
    }
    delete updateData.dob;

    // « Membre depuis » (ancienneté) : modifiable explicitement, jamais recalculée.
    if (data.membreDepuis) {
      updateData.signupDate = dateAMidi(data.membreDepuis);
    }
    delete updateData.membreDepuis;

    if (data.dateInscription) {
      updateData.dateInscription = dateAMidi(data.dateInscription);
    } else if (data.dateInscription === null) {
      updateData.dateInscription = null;
    }

    if (data.finContrat) {
      updateData.finContrat = dateAMidi(data.finContrat);
    } else if (data.finContrat === null) {
      updateData.finContrat = null;
    }
    
    if (data.sections) {
      updateData.sections = {
        deleteMany: {},
        create: data.sections.map((sec: any) => 
          typeof sec === 'string' ? { section: sec } : { section: sec.section, belt: sec.belt || "Blanche" }
        )
      };
    }

    if (data.versements) {
      // Remplacement de l'échéancier SANS perdre l'historique système : on
      // rapproche chaque nouveau versement d'un ancien (par id, sinon par
      // numéro) pour conserver son id (les rappels déjà envoyés — journalisés
      // par id de versement — ne repartent pas), son numéro de reçu, la date
      // d'envoi du reçu et l'exonération des frais de retard. Sans cela,
      // chaque modification de membre renvoyait les rappels de retard aux
      // parents et réutilisait des numéros de reçus.
      const anciens = await prisma.paymentVersement.findMany({ where: { membreId: req.params.id } });
      const parId = new Map(anciens.map((a) => [a.id, a]));
      const parNumero = new Map(anciens.map((a) => [a.numeroVersement, a]));
      const idsRepris = new Set<string>();

      updateData.versements = {
        deleteMany: {},
        create: data.versements.map((v: any) => {
          let ancien = (v.id && parId.get(v.id)) || parNumero.get(v.numeroVersement) || null;
          if (ancien && idsRepris.has(ancien.id)) ancien = null; // jamais deux fois le même id
          if (ancien) idsRepris.add(ancien.id);
          return {
            ...(ancien ? { id: ancien.id } : {}),
            numeroVersement: v.numeroVersement,
            montant: v.montant,
            datePrevue: dateAMidi(v.datePrevue),
            datePaiement: v.datePaiement ? dateAMidi(v.datePaiement) : null,
            methodePaiement: v.methodePaiement,
            note: v.note,
            exonererFraisRetard: ancien?.exonererFraisRetard ?? false,
            receiptNumber: ancien?.receiptNumber ?? null,
            receiptSentAt: ancien?.receiptSentAt ?? null,
            reminderSentAt: ancien?.reminderSentAt ?? null,
          };
        })
      };
    }

    const updatedMember = await prisma.member.update({
      where: { id: req.params.id },
      data: updateData,
      include: { sections: true, versements: { orderBy: { numeroVersement: 'asc' } } }
    });

    logAudit(req, { action: 'UPDATE', entity: 'Member', entityId: updatedMember.id, description: `${updatedMember.firstName} ${updatedMember.lastName}` });

    return sendSuccess(res, updatedMember);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur de modification', 500);
  }
});

// POST /api/membres/:id/renouveler — renouvellement de contrat en un geste.
// Cas type : le parent passe payer le trimestre suivant. Crée le NOUVEAU
// contrat (dateInscription = date choisie, finContrat recalculée, montantFinal
// = montant convenu), AJOUTE le nouvel échéancier à la suite de l'historique
// (rien n'est supprimé, l'ancienneté signupDate ne bouge pas) et, si demandé,
// encaisse immédiatement le premier versement (reçu automatique sauf CASH).
router.post('/:id/renouveler', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const schema = z.object({
      dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
      plan: z.enum(['TRIMESTRIEL', 'ANNUEL']),
      montant: z.number().positive('Le montant doit être positif'),
      nbVersements: z.number().int().min(1).max(3).default(1),
      premierPaiement: z.object({
        methode: z.string(),
        datePaiement: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }).optional().nullable(),
    });
    const data = schema.parse(req.body);

    const membre = await prisma.member.findUnique({
      where: { id: req.params.id },
      include: { versements: true },
    });
    if (!membre) return sendError(res, 'Membre introuvable', 404);

    // Le trimestriel se paie en une fois (règle du centre).
    const nbVersements = data.plan === 'TRIMESTRIEL' ? 1 : data.nbVersements;

    let methode: ReturnType<typeof normalizeMethodePaiement> = null;
    if (data.premierPaiement) {
      methode = normalizeMethodePaiement(data.premierPaiement.methode);
      if (!methode) return sendError(res, 'Méthode de paiement invalide', 400);
    }

    // Échéancier : même répartition des arrondis que le formulaire membre
    // (montant de base au cent inférieur, solde sur le dernier versement).
    const base = Math.floor((data.montant / nbVersements) * 100) / 100;
    const numeroDepart = membre.versements.reduce((max, v) => Math.max(max, v.numeroVersement), 0) + 1;
    const nouveaux = Array.from({ length: nbVersements }, (_, i) => ({
      membreId: membre.id,
      numeroVersement: numeroDepart + i,
      montant: i === nbVersements - 1
        ? Math.round((data.montant - base * (nbVersements - 1)) * 100) / 100
        : base,
      datePrevue: dateAMidi(ajouterMoisISO(data.dateDebut, i)),
      datePaiement: i === 0 && data.premierPaiement ? dateAMidi(data.premierPaiement.datePaiement) : null,
      methodePaiement: i === 0 && data.premierPaiement ? methode : null,
      note: `Renouvellement du ${data.dateDebut}`,
    }));

    const finContrat = calculerFinContrat(data.dateDebut, data.plan);

    await prisma.$transaction([
      prisma.member.update({
        where: { id: membre.id },
        data: {
          plan: data.plan,
          dateInscription: dateAMidi(data.dateDebut),
          finContrat,
          montantFinal: data.montant,
          // Un membre parti ou en attente qui renouvelle est de retour.
          ...(data.premierPaiement && membre.status !== 'ACTIF' ? { status: 'ACTIF' } : {}),
        },
      }),
      prisma.paymentVersement.createMany({ data: nouveaux }),
    ]);

    if (data.premierPaiement) {
      await activerSiPremierPaiement(membre.id);
      const premier = await prisma.paymentVersement.findFirst({
        where: { membreId: membre.id, numeroVersement: numeroDepart },
      });
      if (premier) sendRecuVersementBackground(premier.id);
    }

    logAudit(req, {
      action: 'UPDATE',
      entity: 'Member',
      entityId: membre.id,
      description: `Renouvellement ${data.plan} ${data.montant} $ à partir du ${data.dateDebut} (${nbVersements} versement(s))${data.premierPaiement ? ` — 1er versement encaissé (${methode})` : ''} — ${membre.firstName} ${membre.lastName}`,
    });

    const aJour = await prisma.member.findUnique({
      where: { id: membre.id },
      include: { sections: true, versements: { orderBy: { numeroVersement: 'asc' } } },
    });
    return sendSuccess(res, aJour, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    console.error('Erreur renouvellement:', error);
    return sendError(res, 'Erreur lors du renouvellement', 500);
  }
});

// POST /api/membres/:id/versements
router.post('/:id/versements', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const schema = z.array(z.object({
      numeroVersement: z.number(),
      montant: z.number(),
      datePrevue: z.string(),
      datePaiement: z.string().optional().nullable(),
      methodePaiement: z.enum(['CASH', 'VIREMENT', 'CHEQUE', 'CARTE']).optional().nullable(),
      note: z.string().optional().nullable(),
    }));
    const versementsData = schema.parse(req.body);

    // Supprimer seulement les versements NON payés
    await prisma.paymentVersement.deleteMany({
      where: {
        membreId: id,
        datePaiement: null  // ← protège les versements déjà encaissés
      }
    });
    const created = await prisma.member.update({
      where: { id },
      data: {
        versements: {
          create: versementsData.map(v => ({
            numeroVersement: v.numeroVersement,
            montant: v.montant,
            datePrevue: dateAMidi(v.datePrevue),
            datePaiement: v.datePaiement ? dateAMidi(v.datePaiement) : null,
            methodePaiement: v.methodePaiement,
            note: v.note,
          }))
        }
      },
      include: { versements: true }
    });

    return sendSuccess(res, created.versements);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur de mise à jour des versements', 500);
  }
});

// PATCH /api/membres/:id/statut — changement rapide de statut, SANS passer par le
// formulaire complet (qui exige un échéancier équilibré : bloquant pour rendre
// inactif un membre parti).
router.patch('/:id/statut', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { status, raisonDepart } = z.object({
      status: z.enum(['ACTIF', 'INACTIF', 'EN_ATTENTE']),
      raisonDepart: z.string().max(300).optional().nullable(),
    }).parse(req.body);

    const member = await prisma.member.update({
      where: { id: req.params.id },
      data: {
        status,
        // Le motif n'a de sens que sur un départ ; il s'efface au retour du
        // membre, pour ne pas traîner un « déménagement » sur un dossier actif.
        ...(status === 'INACTIF' ? { raisonDepart: raisonDepart || null } : { raisonDepart: null }),
      },
    });

    // La description est LUE par /api/dashboard/churn pour dater précisément
    // les départs (`updatedAt` bouge à chaque modification de fiche et ne peut
    // pas servir de date de départ). Ne pas changer « → INACTIF » sans adapter
    // la requête correspondante.
    logAudit(req, {
      action: 'UPDATE',
      entity: 'Member',
      entityId: member.id,
      description: `Statut de ${member.firstName} ${member.lastName} → ${status}`
        + (status === 'INACTIF' && raisonDepart ? ` (motif : ${raisonDepart})` : ''),
    });

    return sendSuccess(res, member);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Statut invalide', 400, error.issues);
    return sendError(res, 'Erreur de changement de statut', 500);
  }
});

// DELETE /api/membres/:id — désactivation (défaut) ou suppression DÉFINITIVE
// (?definitif=1, ADMIN) pour les dossiers de test/doublons. Refusée si le membre
// a des paiements encaissés (on ne détruit jamais un historique financier).
router.delete('/:id', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    if (req.query.definitif === '1') {
      if (req.user!.role !== 'ADMIN') {
        return sendError(res, 'Suppression définitive réservée à l\'ADMIN.', 403);
      }
      const cible = await prisma.member.findUnique({
        where: { id: req.params.id },
        include: { versements: true },
      });
      if (!cible) return sendError(res, 'Membre introuvable', 404);
      if (cible.versements.some((v) => v.datePaiement)) {
        return sendError(res, 'Ce membre a des paiements encaissés : suppression définitive refusée. Utilisez plutôt le statut Inactif.', 409);
      }
      await prisma.member.delete({ where: { id: cible.id } });
      logAudit(req, { action: 'DELETE', entity: 'Member', entityId: cible.id, description: `SUPPRESSION DÉFINITIVE de ${cible.firstName} ${cible.lastName} (doublon/test)` });
      return sendSuccess(res, { ok: true, supprime: true });
    }

    const member = await prisma.member.update({
      where: { id: req.params.id },
      data: { status: 'INACTIF' }
    });

    logAudit(req, { action: 'DELETE', entity: 'Member', entityId: member.id, description: `Désactivation de ${member.firstName} ${member.lastName}` });

    return sendSuccess(res, member);
  } catch (error) {
    return sendError(res, 'Erreur lors de la désactivation', 500);
  }
});

export default router;
