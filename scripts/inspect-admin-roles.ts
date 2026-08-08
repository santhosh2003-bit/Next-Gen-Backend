import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.user.findUnique({
      where: { email: "admin@nextgen.local" },
      include: { roles: { include: { role: true } } },
    });
    console.log("ADMIN USER:", JSON.stringify(admin, null, 2));

    const manager = await prisma.user.findUnique({
      where: { email: "manager@nextgen.local" },
      include: { roles: { include: { role: true } } },
    });
    console.log("MANAGER USER:", JSON.stringify(manager, null, 2));

    const allRoles = await prisma.userRole.findMany({
      include: { user: true, role: true },
    });
    console.log("ALL USER ROLES:", JSON.stringify(allRoles, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
