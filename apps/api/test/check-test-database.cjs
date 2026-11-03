const url = process.env.DATABASE_URL;

let isTestDatabase = false;

try {
  const parsed = new URL(url);

  isTestDatabase =
    process.env.NODE_ENV === 'test' &&
    parsed.protocol === 'postgresql:' &&
    parsed.hostname === '127.0.0.1' &&
    parsed.port === '5433' &&
    parsed.pathname === '/orderflow_test';
} catch {
  isTestDatabase = false;
}

if (!isTestDatabase) {
  console.error(
    'Refusing to continue: expected the local test database.',
  );
  process.exit(1);
}

console.log('Test database configuration verified.');
