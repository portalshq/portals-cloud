// Static imports run before test-body environment assignments. Set isolated
// defaults before importing application modules; never query production Neon.
process.env.LEADS_DRY_RUN = 'true'
process.env.NODE_ENV = 'test'
delete process.env.LEADS_DATABASE_URL
process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'test-project'
process.env.NEXT_PUBLIC_SANITY_DATASET = 'test-dataset'
