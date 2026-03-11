/**
 * Test Setup
 *
 * This file runs before all tests to set up the environment.
 */

// Set test environment variables
process.env['NODE_ENV'] = 'test';
process.env['USE_MOCK_ADAPTER'] = 'true';
process.env['LOG_LEVEL'] = 'silent';
