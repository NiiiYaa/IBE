/**
 * Vitest global setup — sets required environment variables so env.ts
 * doesn't call process.exit() during tests.
 */

process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test'
process.env['REDIS_URL'] = 'redis://localhost:6379'
process.env['HYPERGUEST_BEARER_TOKEN'] = 'test-token'
process.env['HYPERGUEST_SEARCH_DOMAIN'] = 'search.test.local'
process.env['HYPERGUEST_BOOKING_DOMAIN'] = 'booking.test.local'
process.env['HYPERGUEST_STATIC_DOMAIN'] = 'static.test.local'
process.env['STRIPE_SECRET_KEY'] = 'sk_test_fake_key_for_tests'
process.env['NODE_ENV'] = 'test'
