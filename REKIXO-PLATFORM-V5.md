# Rekixo Platform Architecture V5

## Locked production architecture

- `rekixo-super-admin`
  - Owner-only Super Admin.
  - D1/R2 shared platform control plane.
- `rekixo-client-sites`
  - One generic Worker for all current and future customer public websites and client-admin access.
  - Project is resolved from hostname or platform slug.
  - No new Worker is required for each customer.
- `tiyansh-prime-square`
  - Temporary zero-downtime legacy bridge only.
  - It uses the same D1/R2 and the same current application code while domains are migrated.

## Tenant isolation

All mutable content stays project-scoped:
- D1 `plots`, `settings`, `gallery`, `admin_users`
- R2 `projects/<projectId>/...`
- New `project_domains` hostname registry
- Public requests resolve a single project from the request hostname.
- `projectId` query parameters are not a public cross-tenant override.
- Draft preview requires an authenticated Super Admin/client session.

## Publication safety

New projects default to `draft`.
A generic project cannot publish until:
- masterplan is ready,
- map dimensions exist,
- plot inventory is not empty,
- every plot has a polygon,
- every polygon validates.

Tiyansh is migrated as `published` and remains the locked legacy reference.

## URLs

Guaranteed after the generic Worker exists:
`https://rekixo-client-sites.<workers-subdomain>.workers.dev/p/<project-slug>`

Optional platform URL after one-time Cloudflare setup:
`https://sites.rekixo.com/p/<project-slug>`

Optional scalable subdomain:
`https://<project-slug>.sites.rekixo.com`

Optional customer domain:
`https://customer-domain.example`

## Cloudflare setup boundary

Saving a domain in Rekixo only configures application routing.

For a hostname to send traffic to the Worker:
- A domain/subdomain in a Cloudflare zone you control can be attached as a Worker Custom Domain or Worker Route.
- For many subdomains under your own zone, use a wildcard DNS record + wildcard Worker Route.
- For customer-owned vanity domains that are not zones in your Cloudflare account, use Cloudflare for SaaS / Custom Hostnames.

Do not create a separate Worker per customer.

Official references:
https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
https://developers.cloudflare.com/workers/configuration/routing/routes/
https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/
https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/hostname-routing/

## One-time Cloudflare recommendation

1. Keep `admin.rekixo.com` on `rekixo-super-admin`.
2. Deploy `rekixo-client-sites`.
3. Attach `sites.rekixo.com` to `rekixo-client-sites` when ready.
4. If you want `client-slug.sites.rekixo.com`, configure wildcard DNS + Worker Route for `*.sites.rekixo.com/*` to `rekixo-client-sites`.
5. Keep the old `tiyansh-prime-square` Worker until the Tiyansh production hostname is confirmed on the generic Worker.
6. Only then remove the legacy deployment step in a later cleanup release.

## Why V5 does not auto-create DNS/custom hostnames

Domain ownership, certificate validation, and Cloudflare zone/SaaS configuration are infrastructure authorization steps. The application stores and resolves the mapping, but it must not silently create or hijack DNS hostnames.
