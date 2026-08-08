-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "expectedDeliveryAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'kg';
