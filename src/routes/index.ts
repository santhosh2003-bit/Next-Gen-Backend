import type { FastifyInstance } from 'fastify';
import authRoutes from '../modules/auth/auth.routes.js';
import usersRoutes from '../modules/users/users.routes.js';
import categoriesRoutes from '../modules/categories/categories.routes.js';
import brandsRoutes from '../modules/brands/brands.routes.js';
import productsRoutes from '../modules/products/products.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import cartRoutes from '../modules/cart/cart.routes.js';
import checkoutRoutes from '../modules/checkout/checkout.routes.js';
import ordersRoutes from '../modules/orders/orders.routes.js';
import paymentRoutes from '../modules/payment/payment.routes.js';
import couponsRoutes from '../modules/coupons/coupons.routes.js';
import wishlistRoutes from '../modules/wishlist/wishlist.routes.js';
import reviewsRoutes from '../modules/reviews/reviews.routes.js';
import notificationsRoutes from '../modules/notifications/notifications.routes.js';
import searchRoutes from '../modules/search/search.routes.js';
import analyticsRoutes from '../modules/analytics/analytics.routes.js';
import uploadsRoutes from '../modules/uploads/uploads.routes.js';
import settingsRoutes from '../modules/settings/settings.routes.js';
import feedbackRoutes from '../modules/feedback/feedback.routes.js';
import advertisementsRoutes from '../modules/advertisements/advertisements.routes.js';
import productRequestsRoutes from '../modules/product-requests/product-requests.routes.js';

/** Register every module under the API prefix. */
export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(usersRoutes, { prefix: '/users' });
  await app.register(categoriesRoutes, { prefix: '/categories' });
  await app.register(brandsRoutes, { prefix: '/brands' });
  await app.register(productsRoutes, { prefix: '/products' });
  await app.register(inventoryRoutes, { prefix: '/inventory' });
  await app.register(cartRoutes, { prefix: '/cart' });
  await app.register(checkoutRoutes, { prefix: '/checkout' });
  await app.register(ordersRoutes, { prefix: '/orders' });
  await app.register(paymentRoutes, { prefix: '/payments' });
  await app.register(couponsRoutes, { prefix: '/coupons' });
  await app.register(wishlistRoutes, { prefix: '/wishlist' });
  await app.register(reviewsRoutes, { prefix: '/reviews' });
  await app.register(notificationsRoutes, { prefix: '/notifications' });
  await app.register(searchRoutes, { prefix: '/search' });
  await app.register(analyticsRoutes, { prefix: '/analytics' });
  await app.register(uploadsRoutes, { prefix: '/uploads' });
  await app.register(settingsRoutes, { prefix: '/settings' });
  await app.register(feedbackRoutes, { prefix: '/feedback' });
  await app.register(advertisementsRoutes, { prefix: '/advertisements' });
  await app.register(productRequestsRoutes, { prefix: '/product-requests' });
}
