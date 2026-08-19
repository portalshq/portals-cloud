# Build Guide: Lore and Auth Gateway Images

This guide documents how to build and publish Lore server and Auth Gateway container images for production deployment.

## Current Status

**Build automation**: Not currently automated. Container image builds require manual execution with environment variables.

**Release automation**: GitHub Actions workflow exists for npm package releases (`.github/workflows/release.yml`), but does not include container image builds.

## Build Options

### Option 1: Local Build (Current Approach)

Build images locally using Docker BuildKit and push to ECR. This is the fastest approach for iterative builds and doesn't require additional CI/CD infrastructure.

#### Prerequisites

- Docker installed locally with BuildKit enabled
- AWS credentials configured for ECR push access
- `cosign` CLI installed (for production signing)
- Access to the artifact-signing KMS key

#### Lore Server Build

```bash
cd /Users/vibrantceo/Projects/portals/cloud

# Required environment variables
export ECR_REGISTRY=907199504810.dkr.ecr.us-east-1.amazonaws.com
export ENVIRONMENT=prod                    # 'dev' or 'prod'
export REQUIRE_SIGNATURE=true             # Must be true for production
export COSIGN_KEY=aws-kms://alias/portals-artifact-signing

# Optional environment variables
export ECR_NAMESPACE=portals-prod          # Defaults to portals-${ENVIRONMENT}
export PLATFORMS=linux/amd64,linux/arm64  # Defaults to linux/amd64,linux/arm64
export TARGETARCH=arm64                    # Target architecture for verification

# Build and publish
./infra/lore/scripts/docker-buildx-lore.sh
```

The script will:
1. Check for uncommitted source/packaging changes (fails if dirty)
2. Build base image with provenance and SBOM
3. Build server image with provenance and SBOM
4. Push multi-architecture manifests to ECR
5. Sign the image with the artifact-signing KMS key (if `REQUIRE_SIGNATURE=true`)
6. Run ECR and Trivy scans
7. Verify SBOM and provenance
8. Update `infra/lore/versions.yaml` with the new image digest

#### Auth Gateway Build

```bash
cd /Users/vibrantceo/Projects/portals/cloud/control-plane

# Required environment variables
export ECR_REGISTRY=907199504810.dkr.ecr.us-east-1.amazonaws.com
export ENVIRONMENT=prod                    # 'dev' or 'prod'
export REQUIRE_SIGNATURE=true             # Must be true for production
export COSIGN_KEY=aws-kms://alias/portals-artifact-signing

# Optional environment variables
export ECR_NAMESPACE=portals-prod          # Defaults to portals-${ENVIRONMENT}
export PLATFORMS=linux/arm64               # Defaults to linux/${TARGETARCH}
export TARGETARCH=arm64                    # Target architecture for verification

# Build and publish
./scripts/publish-auth-gateway.sh
```

The script will:
1. Check for uncommitted source/packaging changes (fails if dirty)
2. Build image with provenance and SBOM
3. Push to ECR
4. Sign the image with the artifact-signing KMS key (if `REQUIRE_SIGNATURE=true`)
5. Run ECR and Trivy scans
6. Verify SBOM and provenance
7. Update `infra/lore/versions.yaml` with the new image digest

#### Production Build Requirements

For production builds (`ENVIRONMENT=prod`), the scripts enforce:
- `REQUIRE_SIGNATURE=true` - images must be signed with the artifact-signing key
- Clean source trees - no uncommitted changes allowed
- ECR and Trivy zero critical/high findings
- SBOM and provenance verification

### Option 2: Cloud Build (GitHub Actions - Recommended for Production)

Build images in GitHub Actions using self-hosted runners or AWS CodeBuild. This provides reproducible builds in a controlled environment.

#### GitHub Actions Workflow

Create `.github/workflows/build-images.yml`:

```yaml
name: Build Container Images

on:
  push:
    branches:
      - main
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment (dev or prod)'
        required: true
        default: 'dev'
        type: choice
        options:
          - dev
          - prod

jobs:
  build-lore:
    name: Build Lore Server Image
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::907199504810:role/github-actions-ecr-push
          aws-region: us-east-1

      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Install cosign
        uses: sigstore/cosign-installer@v3

      - name: Build Lore image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ENVIRONMENT: ${{ github.event.inputs.environment || 'dev' }}
          REQUIRE_SIGNATURE: ${{ github.event.inputs.environment == 'prod' && 'true' || 'false' }}
          COSIGN_KEY: ${{ github.event.inputs.environment == 'prod' && 'aws-kms://alias/portals-artifact-signing' || '' }}
        run: |
          ./infra/lore/scripts/docker-buildx-lore.sh

      - name: Upload image digest
        run: |
          echo "Lore image built and pushed"
          cat infra/lore/versions.yaml

  build-auth-gateway:
    name: Build Auth Gateway Image
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::907199504810:role/github-actions-ecr-push
          aws-region: us-east-1

      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Install cosign
        uses: sigstore/cosign-installer@v3

      - name: Build Auth Gateway image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ENVIRONMENT: ${{ github.event.inputs.environment || 'dev' }}
          REQUIRE_SIGNATURE: ${{ github.event.inputs.environment == 'prod' && 'true' || 'false' }}
          COSIGN_KEY: ${{ github.event.inputs.environment == 'prod' && 'aws-kms://alias/portals-artifact-signing' || '' }}
        run: |
          ./control-plane/scripts/publish-auth-gateway.sh

      - name: Upload image digest
        run: |
          echo "Auth Gateway image built and pushed"
          cat infra/lore/versions.yaml
```

#### AWS CodeBuild Alternative

Create a CodeBuild project with:
- Build specification to run the build scripts
- IAM role with ECR push permissions
- KMS sign permissions
- Access to source repositories

`buildspec.yml`:

```yaml
version: 0.2
phases:
  install:
    runtime-versions:
      docker: 20
  pre_build:
    commands:
      - $(aws ecr get-login --no-include-email --region $AWS_REGION)
      - echo "Installing cosign..."
      - wget -O cosign https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64
      - chmod +x cosign
      - sudo mv cosign /usr/local/bin/
  build:
    commands:
      - export ECR_REGISTRY=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
      - export ENVIRONMENT=$ENVIRONMENT
      - export REQUIRE_SIGNATURE=$REQUIRE_SIGNATURE
      - export COSIGN_KEY=$COSIGN_KEY
      - ./infra/lore/scripts/docker-buildx-lore.sh
      - ./control-plane/scripts/publish-auth-gateway.sh
artifacts:
  files:
    - infra/lore/versions.yaml
```

#### Cloud Build Prerequisites

1. **GitHub OIDC Role** (recommended for GitHub Actions):
   - Create IAM role: `github-actions-ecr-push`
   - Trust relationship: `oidc.amazonaws.com` with GitHub organization
   - Permissions: `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:PutImage`, `kms:Sign`, `kms:GetPublicKey`, `kms:DescribeKey`

2. **CodeBuild Service Role** (for CodeBuild):
   - Create IAM role: `codebuild-ecr-push`
   - Permissions: same as above
   - Additional: `codebuild:*` for project management

3. **KMS Key Policy**:
   - Add the build role to the artifact-signing key policy
   - Allow `kms:Sign`, `kms:GetPublicKey`, `kms:DescribeKey`

## Verification

After building, verify the images are correctly signed and recorded:

```bash
# Check versions.yaml
cat infra/lore/versions.yaml

# Verify Lore image signature
cosign verify --key aws-kms://alias/portals-artifact-signing \
  907199504810.dkr.ecr.us-east-1.amazonaws.com/portals-prod/lore@<digest>

# Verify Auth Gateway image signature
cosign verify --key aws-kms://alias/portals-artifact-signing \
  907199504810.dkr.ecr.us-east-1.amazonaws.com/portals-prod/auth-gateway@<digest>

# Check ECR scan results
aws ecr describe-image-scan-findings \
  --repository-name portals-prod/lore \
  --image-id imageDigest=<digest> \
  --region us-east-1
```

## Automation Recommendations

### Immediate

1. **Create a local build wrapper script**:
   - `scripts/build-prod-images.sh` that sets all required environment variables
   - Simplifies local builds to a single command

2. **Document environment variables**:
   - Add `.env.example` files with required variables
   - Document in README files

### Short-term

1. **Implement GitHub Actions workflow**:
   - Automated builds on main branch push
   - Manual trigger for production builds
   - Separate dev/prod workflows

2. **Add build status badges**:
   - Show build status in README
   - Link to workflow runs

### Long-term

1. **Implement automated promotion**:
   - Dev builds on every commit
   - Promote to prod after manual approval
   - Integration with release process

2. **Add build notifications**:
   - Slack/Discord notifications for build failures
   - Email notifications for production builds

3. **Implement image scanning gate**:
   - Block deployment if critical/high vulnerabilities found
   - Automatic security advisories

## Troubleshooting

### Docker BuildKit not enabled

```bash
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
```

### ECR login failure

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 907199504810.dkr.ecr.us-east-1.amazonaws.com
```

### Cosign KMS authentication

Ensure the AWS credentials have KMS permissions:
```bash
aws kms describe-key --key-id alias/portals-artifact-signing --region us-east-1
```

### Dirty source tree errors

Commit or stash changes before building:
```bash
git status
git add .
git commit -m "chore: prepare for production build"
```

### Multi-architecture build failures

Ensure QEMU is installed for cross-platform builds:
```bash
docker run --privileged --rm tonistiigi/binfmt --install all
```
