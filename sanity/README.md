# Sanity Clean Content Studio

Congratulations, you have now installed the Sanity Content Studio, an open-source real-time content editing environment connected to the Sanity backend.

Now you can do the following things:

- [Read "getting started" in the docs](https://www.sanity.io/docs/introduction/getting-started?utm_source=readme)
- [Join the Sanity community](https://www.sanity.io/community/join?utm_source=readme)
- [Extend and build plugins](https://www.sanity.io/docs/content-studio/extending?utm_source=readme)

## Scripts

This project includes several scripts for managing Sanity content. All scripts that require write access to the content lake must be run through the Sanity CLI with the `--with-user-token` flag to ensure proper authentication.

### Available Scripts

- `npm run attach:package-specifications` - Attach package specifications to resources
- `npm run publish:package-specifications` - Publish package specifications
- `npm run publish:paid-pilot-brief` - Publish the paid pilot brief document

### Important Usage Notes

**Always use npm scripts** - Do not run scripts directly with `node scripts/script-name.mjs`. This will fail with 403 "Insufficient permissions" errors because the client won't have proper authentication.

**Correct approach:**
```bash
npm run publish:paid-pilot-brief
```

**Incorrect approach:**
```bash
node scripts/publish-paid-pilot-brief.mjs  # This will fail with 403 error
```

The scripts use `getCliClient()` from `sanity/cli` which requires the Sanity CLI's authentication context to work properly.