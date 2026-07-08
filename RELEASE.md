# Release Workflow

### Command 1: Documenting a Change (During a Pull Request)
Whenever an engineer writes code that needs to be published, they run this in their feature branch before pushing:

```bash
npx changeset
```

* **What it does:** Opens an interactive CLI asking which package changed, whether it's a patch/minor/major, and what the changelog summary is.
* **Result:** It generates a tiny markdown file in `.changeset/`. The developer commits this file and opens their PR.

### Command 2: Merging to Main (The Actual Release Trigger)
There is no command line step here. When a maintainer reviews the feature PR and is satisfied:
* They click **"Merge pull request"** on GitHub.

---

### Part 3: How the CI Automates the Rest Behind the Scenes
Once code hits your `main` branch, a new Release Engine workflow takes over. It operates in a loop:

* **The Release PR is Born:** The CI sees new changeset markdown files on `main`. It automatically runs `changeset version`, creates a new Git branch, updates the `package.json` versions/changelogs, and opens a permanent **"Release Packages"** Pull Request on GitHub.
* **The Accumulation Phase:** As more feature PRs are merged into `main`, the CI automatically updates this pending Release PR with the new versions and aggregated changelogs.
* **The Final Push:** When you are ready to actually publish to npm, a maintainer simply merges the **"Release Packages"** Pull Request.
* **Automatic Tagging & Publishing:** The CI detects the merge, automatically generates all corresponding Git tags (e.g., `@portals/sdk@1.0.1`), pushes them to Git, builds the code, and publishes to npm.

---

### Step-by-Step Execution Mechanics (How it plays out)
When your team begins pushing features, here is the exact automated flow that unfolds across your code history:

```text
[Developer PR] ──> Merged into 'main'
                        │
                        ▼
           [CI checks for .changeset files]
                        │
                        ▼
     [CI creates/updates 'Release Packages' PR]
  (Bumps independent versions & writes independent changelogs)
                        │
                        ▼
           [Maintainer Merges Release PR]
                        │
                        ▼
       [CI auto-creates individual Git tags]
    (e.g., @portals/sdk@1.0.4, @portals/resolver@2.1.1)
                        │
                        ▼
       [CI publishes only changed to npm]
```

* **Developing:** A developer creates a bugfix for `@portals/sdk`. They run `npx changeset`, select `@portals/sdk`, choose `patch`, and type a summary. They commit the markdown file and merge their PR to `main`.
* **The Automation Ingestion:** The Release Engine CI kicks off on `main`. It sees the new markdown file and compiles a unique git branch called `changesets-release`.
* **The Automated Pull Request:** The CI opens a Pull Request back into `main` titled **"Version Packages"**. If you open this PR on GitHub, you will see it has edited only the `package.json` and `CHANGELOG.md` inside the `packages/sdk/` directory.
* **The Deployment Trigger:** When a maintainer clicks **Merge** on that specific automated PR, the CI executes your publish script. It isolates the changed packages, builds them with Turborepo, creates separate Git tags for each modified package, pushes those tags back to GitHub for tracking, and pushes the code straight to npm.
