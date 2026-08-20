#!/usr/bin/env python3
"""
Asylum Stats automated pipeline.
1. Refresh GOV.UK route data
2. Transform into live marts
3. Rebuild the Astro site
4. Deploy via GitHub (triggers GitHub Actions)
"""
import subprocess, os, sys, time, json

REPO_DIR = "/opt/asylumstats"
REPO = "tompickup23/asylumstats"

def run(cmd, cwd=REPO_DIR, timeout=120):
    """Run a command and return success/output."""
    print(f"  $ {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr[:300]}")
        return False, result.stderr
    return True, result.stdout


def refresh_data():
    """Fetch latest GOV.UK data and transform."""
    print("\n=== 1. Fetching latest route data ===")
    ok, out = run("npm run fetch:routes", timeout=60)
    if not ok:
        print("  Fetch failed, continuing with existing data")

    print("\n=== 2. Transforming routes ===")
    ok, out = run("npm run transform:routes", timeout=60)
    if not ok:
        return False

    print("\n=== 3. Transforming hotels ===")
    run("npm run transform:hotels", timeout=30)

    print("\n=== 4. Transforming money ledger ===")
    run("npm run transform:money", timeout=30)

    print("\n=== 5. Transforming regional sources ===")
    run("npm run transform:regionalsources", timeout=30)

    return True


def build_site():
    """Build the Astro site."""
    print("\n=== 6. Building Astro site ===")
    ok, out = run("npm run build", timeout=180)
    if not ok:
        print("  Build failed!")
        return False
    print("  Build successful")
    return True


def commit_and_push():
    """Commit data changes and push to trigger GitHub Actions deploy."""
    print("\n=== 7. Committing changes ===")

    # Check for changes
    ok, status = run("git status --porcelain")
    if not status.strip():
        print("  No changes to commit")
        return True

    print(f"  Changes found:\n{status[:500]}")

    run("git add src/data/live/")
    run('git commit -m "data: refresh GOV.UK route data + transform marts"')

    print("\n=== 8. Pushing to GitHub (triggers deploy) ===")
    ok, out = run("git push origin main", timeout=30)
    if ok:
        print("  Pushed — GitHub Actions will deploy to asylumstats.co.uk")
    else:
        print("  Push failed — may need git config")
    return ok


def check_deploy():
    """Check GitHub Actions deploy status."""
    print("\n=== 9. Checking deploy status ===")
    time.sleep(10)
    result = subprocess.run(
        ["gh", "api", f"/repos/{REPO}/actions/runs?per_page=1",
         "--jq", ".workflow_runs[0] | {status: .status, conclusion: .conclusion, created_at: .created_at}"],
        capture_output=True, text=True, timeout=15,
    )
    if result.stdout.strip():
        run_info = json.loads(result.stdout.strip())
        print(f"  Latest run: {run_info.get('status')} / {run_info.get('conclusion')}")
    return True


if __name__ == "__main__":
    print("=" * 60)
    print("  ASYLUM STATS DATA REFRESH PIPELINE")
    print("=" * 60)

    if refresh_data():
        print("\n  Data refresh complete")
    else:
        print("\n  Data refresh had errors — check logs")

    # Don't build locally (GitHub Actions does that)
    # Just commit data changes and push
    commit_and_push()
    check_deploy()

    print("\n" + "=" * 60)
    print("  DONE — check https://asylumstats.co.uk")
    print("=" * 60)
