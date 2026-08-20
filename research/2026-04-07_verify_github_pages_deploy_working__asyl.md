# Research: Verify GitHub Pages deploy working (asylumstats.co.uk)

Generated: 2026-04-07
Project: asylum_stats

## **Research Brief: GitHub Pages Deploy Verification for asylumstats.co.uk**
**Priority:** H
**Status:** *Unverified*

---

### **Key Findings**
1. **Current Deployment Status Unknown**
   - No explicit confirmation in `README.md`, `roadmap.md`, or `claude-build-brief.md` that GitHub Pages is actively deployed.
   - The Astro-based static site (`/opt/asylumstats/`) is confirmed to exist, but build/deploy workflows are not referenced in the provided docs.

2. **Potential Deployment Paths**
   - Astro supports GitHub Pages via:
     - `gh-pages` branch (manual)
     - GitHub Actions (automated)
   - No `.github/workflows/deploy.yml` or similar file was found in the file tree.

3. **Live Data Marts Present**
   - Live JSON data exists in `src/data/live/` (e.g., `route-dashboard.json`, `money-ledger.json`), but their deployment to GitHub Pages is unverified.

---

### **Next Steps**
1. **Verify GitHub Pages Deployment**
   - **Command:** Check the `gh-pages` branch:
     ```bash
     cd /opt/asylumstats
     git branch -a | grep gh-pages
     ```
   - **If missing:** Create a GitHub Actions workflow to auto-deploy on `main` branch pushes:
     ```yaml
     # .github/workflows/deploy.yml
     name: Deploy to GitHub Pages
     on:
       push:
         branches: ["main"]
     jobs:
       deploy:
         runs-on: ubuntu-latest
         steps:
           - uses: actions/checkout@v4
           - uses: actions/setup-node@v4
             with:
               node-version: 20
           - run: npm ci
           - run: npm run build
           - uses: peaceiris/actions-gh-pages@v3
             with:
               github_token: ${{ secrets.GITHUB_TOKEN }}
               publish_dir: ./dist
     ```

2. **Test Local Build & Serve**
   - **Command:** Build and serve locally to confirm Astro works:
     ```bash
     cd /opt/asylumstats
     npm install
     npm run build
     npm run preview
     ```
   - **URL:** Access `http://localhost:4321` to verify the site renders.

3. **Check Live Site**
   - **URL:** Visit [https://asylumstats.github.io/asylumstats/](https://asylumstats.github.io/asylumstats/) (GitHub Pages default) or [https://asylumstats.co.uk](https://asylumstats.co.uk) (custom domain).
   - **If custom domain fails:** Verify DNS settings (CNAME record for `asylumstats.co.uk` pointing to `asylumstats.github.io`).

4. **Validate Data Marts**
   - **Command:** Fetch live data endpoints (if deployed):
     ```bash
     curl https://asylumstats.co.uk/data/live/route-dashboard.json
     ```
   - **Expected:** Valid JSON response matching `src/data/live/route-dashboard.json`.

---

### **Resources**
- **Astro GitHub Pages Guide:** [https://docs.astro.build/en/guides/deploy/github/](https://docs.astro.build/en/guides/deploy/github/)
- **GitHub Actions Docs:** [https://docs.github.com/en/actions](https://docs.github.com/en/actions)
- **Custom Domain Setup:** [https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)

---
### **Risks/Blockers**
- **Missing Workflow:** If no deploy workflow exists, GitHub Pages won’t auto-update.
- **Custom Domain Issues:** DNS misconfiguration could break `asylumstats.co.uk`.
- **Broken Build:** Local build failure (`npm run build`) would prevent deployment.