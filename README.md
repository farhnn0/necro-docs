This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Use Necro-Docs from Kiro (MCP)

1. Install: `npm ci`
2. Create `.env.local`. `GITHUB_TOKEN` is strongly recommended (without it GitHub rate limits are low). An AI key is optional: without one, `synthesize_patch` falls back to static fixes.
3. Start the app: `npm run dev` (the MCP server calls `http://localhost:3000`; override with `NECRO_API_URL`).
4. In Kiro, enable the `necro-docs` server from `.kiro/settings/mcp.json` (MCP Servers panel). `synthesize_patch` is never auto-approved; you review every patch.
5. Try these prompts:
   - "Analyze github.com/owner/repo with necro-docs and list the worst files."
   - "Show findings for src/lib/foo.ts in owner/repo and tell me which are auto-fixable."
   - "Synthesize a patch for src/lib/foo.ts in owner/repo, show me the diff, and apply it only after I approve."

The workflow rules live in `.kiro/steering/necro-surgeon.md`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
