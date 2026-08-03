-- Campos de billing que faltavam (workarounds documentados em apps/web/src/server/lib/billing)
ALTER TABLE "Subscription" ADD COLUMN "gatewayCustomerId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "pendingPlanId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "invoiceUrl" TEXT;
ALTER TYPE "SubStatus" ADD VALUE 'PENDING' BEFORE 'TRIALING';
