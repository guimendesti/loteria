-- Bloqueio administrativo (BO-13) e cidade do recebedor Pix (campo 60 do BR Code).
-- Aditivo e nullable: nenhuma linha existente precisa de backfill.
ALTER TABLE "User" ADD COLUMN "city" TEXT;
ALTER TABLE "User" ADD COLUMN "blockedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "blockedReason" TEXT;

-- Busca do backoffice por contas bloqueadas.
CREATE INDEX "User_blockedAt_idx" ON "User"("blockedAt");
