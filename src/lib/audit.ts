import { Request } from 'express';
import { prisma } from './prisma';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'PAY';

// Enregistre une entrée d'audit (non bloquant : n'interrompt jamais la requête).
export function logAudit(
  req: Request,
  data: { action: AuditAction; entity: string; entityId?: string | null; description?: string | null }
): void {
  const u = req.user;
  const userNom = u
    ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.userId
    : null;

  prisma.auditLog
    .create({
      data: {
        userId: u?.userId ?? null,
        userNom,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId ?? null,
        description: data.description ?? null,
      },
    })
    .catch((e) => console.error('Erreur audit:', e));
}
