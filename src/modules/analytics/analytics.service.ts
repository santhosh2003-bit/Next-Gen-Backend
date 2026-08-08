import { prisma } from '../../common/prisma.js';

export const analyticsService = {
  /** High-level KPIs for the admin dashboard. */
  async dashboard() {
    const [userCount, productCount, orderCount, paidAgg, pendingOrders, lowStock] = await Promise.all([
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.product.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.order.count(),
      prisma.order.aggregate({
        where: { status: { in: ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'] } },
        _sum: { grandTotal: true },
      }),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.inventory.count({ where: { reorderLevel: { gt: 0 } } }),
    ]);

    return {
      users: userCount,
      products: productCount,
      orders: orderCount,
      pendingOrders,
      revenue: Number(paidAgg._sum.grandTotal ?? 0),
      warehousesLowStockWatch: lowStock,
    };
  },

  /** Revenue grouped by order status. */
  async revenueByStatus() {
    const rows = await prisma.order.groupBy({
      by: ['status'],
      _sum: { grandTotal: true },
      _count: { _all: true },
    });
    return rows.map((r) => ({
      status: r.status,
      orders: r._count._all,
      revenue: Number(r._sum.grandTotal ?? 0),
    }));
  },

  /** Best-selling products by quantity sold. */
  async topProducts(limit = 10) {
    const grouped = await prisma.orderItem.groupBy({
      by: ['productId', 'name'],
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    return grouped.map((g) => ({
      productId: g.productId,
      name: g.name,
      unitsSold: g._sum.quantity ?? 0,
      revenue: Number(g._sum.lineTotal ?? 0),
    }));
  },

  /** Recent orders for the dashboard feed. */
  async recentOrders(limit = 10) {
    return prisma.order.findMany({
      take: limit,
      orderBy: { placedAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        grandTotal: true,
        placedAt: true,
        user: { select: { email: true } },
      },
    });
  },
};
