# Vercel → AWS Marketing Website Migration Guide

## Decision Framework

### When to Keep Marketing on Vercel

**Advantages:**
- **Developer Experience**: Vercel's preview deployments, git integration, and zero-config deployment
- **Global Edge Network**: Vercel's CDN is optimized for static content worldwide
- **SEO Optimization**: Built-in SEO features, meta tags, sitemaps
- **Content Velocity**: Marketing teams can deploy content changes without engineering involvement
- **Cost**: Generous free tier (100GB bandwidth + unlimited deployments)
- **Separation of Concerns**: Marketing isolated from product infrastructure
- **Edge Functions**: Simple serverless functions for marketing logic

**Best For:**
- Content-heavy marketing sites (blogs, landing pages, documentation)
- Frequent content updates by non-engineers
- SEO-critical pages
- MVP stage where DX matters more than operational simplicity

### When to Move Marketing to AWS

**Advantages:**
- **Single Cloud Provider**: Simplified operations, billing, monitoring
- **Shared Infrastructure**: Reuse EC2 instances, ALB, security groups
- **Consistent Security Model**: Single IAM, VPC, security policies
- **Better Backend Integration**: Direct VPC access to databases, APIs
- **Unified Deployment Pipeline**: Single CI/CD for all services
- **No Cross-Cloud Complexity**: No Vercel → AWS communication latency
- **Cost Predictability**: Single AWS bill, no third-party dependencies

**Best For:**
- Marketing requires backend integration (dynamic content, user-specific features)
- Marketing needs database access (personalization, analytics)
- Team wants single-cloud operations
- Marketing has complex logic beyond static content
- Product maturity stage where operational simplicity matters

## Free Tier Impact Analysis

### Current Vercel + AWS Architecture

**Vercel Marketing:**
- Bandwidth: Uses Vercel free tier (100GB)
- Deployments: Unlimited
- Functions: Minimal usage

**AWS Product:**
- EC2 t3.micro: 750 hours free tier
- CloudFront: 1TB + 10M requests free tier (mostly unused)
- Lambda: 1M requests + 400K GB-seconds free tier (mostly unused)
- RDS: 750 hours + 20GB storage free tier (in use)
- ALB: 750 hours + 15GB data free tier (in use)
- Cognito: $0.01/month
- SES: 3,000 messages free tier (to be used)

### Proposed AWS-Only Architecture

**AWS Marketing + Product:**
- EC2 t3.micro: 750 hours free tier (shared)
- CloudFront: 1TB + 10M requests free tier (increased usage)
- S3: 5GB storage free tier (marketing assets)
- Lambda: 1M requests + 400K GB-seconds free tier (marketing functions)
- RDS: 750 hours + 20GB storage free tier (unchanged)
- ALB: 750 hours + 15GB data free tier (increased usage)
- Cognito: $0.01/month (unchanged)
- SES: 3,000 messages free tier (unchanged)

### Free Tier Impact Assessment

**CloudFront Impact:**
- **Current**: Minimal usage (product backend only)
- **After**: Marketing static assets + API caching
- **Risk**: Could approach 1TB limit with high traffic
- **Mitigation**: CloudFront Pro plan ($15/month) if needed

**S3 Impact:**
- **Current**: Minimal usage (Lore chunks only)
- **After**: Marketing static assets (images, CSS, JS)
- **Risk**: Could approach 5GB limit with large media library
- **Mitigation**: CloudFront Pro plan includes 50GB S3 storage

**Lambda Impact:**
- **Current**: Minimal usage (lead processing only)
- **After**: Marketing edge functions, dynamic content
- **Risk**: Could approach 1M request limit with high traffic
- **Mitigation**: Most marketing content can be static

**EC2 Impact:**
- **Current**: Single t3.micro for product services
- **After**: Same t3.micro for product + marketing containers
- **Risk**: No additional cost (already using free tier)
- **Mitigation**: Add second instance if needed ($15/month)

**ALB Impact:**
- **Current**: Product backend traffic only
- **After**: Marketing + product traffic
- **Risk**: Could approach 15GB data limit
- **Mitigation**: ALB usage typically low for marketing sites

### Conclusion on Free Tier

**Moving marketing to AWS WILL NOT break free tier usage** if:
- Marketing is primarily static content (not heavy dynamic features)
- Marketing traffic is moderate (<10K visitors/month)
- Media library is optimized (<5GB storage)
- Lambda functions are minimal (<100K requests/month)

**Moving marketing to AWS MAY impact free tier if:**
- Marketing has heavy dynamic content requiring Lambda
- Marketing has large media library (>5GB)
- Marketing has high traffic (>10K visitors/month)
- Marketing uses complex edge functions

## Migration Paths

### Option 1: Keep Vercel for Now (Recommended for MVP)

**Rationale:**
- Maintain Vercel's DX for marketing velocity
- Focus engineering on product backend
- Defer marketing migration until product is stable
- Migrate when operational complexity becomes problematic

**Migration Trigger:**
- Marketing requires backend integration
- Marketing traffic scales beyond Vercel comfort zone
- Team wants single-cloud operations
- Marketing complexity requires AWS features

**Estimated Timeline:** 6-12 months from product launch

### Option 2: Move Marketing to AWS Immediately

**Rationale:**
- Single cloud from day one
- Shared deployment pipeline from start
- Consistent security model from start
- No future migration effort

**Trade-offs:**
- More initial infrastructure complexity
- Slower marketing content velocity
- More engineering overhead for marketing changes
- Losing Vercel's edge network benefits

**Estimated Timeline:** 2-3 weeks additional implementation

### Option 3: Hybrid Approach

**Rationale:**
- Marketing static content on Vercel (SEO-optimized pages)
- Marketing dynamic features on AWS (personalization, user-specific)
- Gradual migration of components

**Trade-offs:**
- Still cross-cloud complexity
- Split deployment pipeline
- More architectural complexity

**Estimated Timeline:** 1-2 weeks additional implementation

## Technical Migration Steps (If Moving to AWS)

### Phase 1: Frontend Containerization

#### 1.1 Create Marketing Dockerfile
**File**: `frontend/marketing/Dockerfile`

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

#### 1.2 Create Marketing Service Component
**File**: `infra/pulumi/src/components/MarketingService.ts`

**Configuration:**
- ECS task definition (EC2 launch type)
- Container port: 3000
- Share existing EC2 instance with product services
- Environment variables: API URLs, feature flags
- Security group: ALB ingress, no database access (read-only marketing)

### Phase 2: Static Assets Management

#### 2.1 S3 Bucket for Marketing Assets
**File**: `infra/pulumi/src/components/MarketingAssets.ts`

**Configuration:**
- S3 bucket for marketing static assets
- CloudFront origin
- Public read access
- Versioning enabled
- Lifecycle rules for old assets

#### 2.2 CloudFront Distribution
**File**: `infra/pulumi/src/components/CloudFrontCDN.ts`

**Configuration**:
- Two origins: S3 (static) + ALB (dynamic)
- Behaviors: Cache static, pass-through dynamic
- Custom error pages
- HTTPS only
- Compress responses

### Phase 3: DNS and SSL

#### 3.1 Update Route53 Records
**File**: `infra/pulumi/src/components/DNS.ts`

**Changes**:
- Update marketing A record to CloudFront
- Update product subdomain to ALB
- Maintain existing auth/lore subdomains

#### 3.2 SSL Certificates
**File**: `infra/pulumi/src/components/SSL.ts`

**Configuration**:
- ACM certificate for marketing domain
- ACM certificate for product domain
- Use existing wildcard certificate if available

### Phase 4: Deployment Pipeline

#### 4.1 CI/CD Configuration
**File**: `.github/workflows/deploy-marketing.yml`

**Steps**:
1. Build marketing container
2. Push to ECR
3. Update ECS task definition
4. Deploy to ECS
5. Run smoke tests

#### 4.2 Database Migrations
**File**: `packages/database/migrations/marketing_analytics.sql`

**Schema**:
```sql
-- Marketing analytics tables
CREATE TABLE marketing_page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path VARCHAR(255) NOT NULL,
  referrer VARCHAR(500),
  user_agent VARCHAR(500),
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE marketing_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_type VARCHAR(50) NOT NULL,
  page_path VARCHAR(255) NOT NULL,
  referrer VARCHAR(500),
  timestamp TIMESTAMP DEFAULT NOW()
);
```

### Phase 5: Monitoring and Analytics

#### 5.1 CloudWatch Dashboards
**File**: `infra/pulumi/src/components/MarketingMonitoring.ts`

**Metrics**:
- Page views per minute
- Conversion rate
- Error rate
- Response time
- CloudFront cache hit ratio

#### 5.2 Error Tracking
**Integration**: Sentry or CloudWatch Logs

### Phase 6: Testing and Validation

#### 6.1 SEO Validation
**Checks**:
- Meta tags present
- Sitemap accessible
- Robots.txt correct
- Page speed acceptable
- Mobile-friendly

#### 6.2 Performance Validation
**Checks**:
- Lighthouse scores
- Core Web Vitals
- Cache hit ratio
- CDN performance

## Cost Comparison

### Vercel + AWS (Current)
- **Vercel**: $0 (free tier)
- **AWS**: $0.01/month (Cognito)
- **Total**: $0.01/month

### AWS Only (Marketing + Product)
- **EC2 t3.micro**: $0 (free tier)
- **CloudFront**: $0 (free tier - 1TB + 10M requests)
- **S3**: $0 (free tier - 5GB)
- **Lambda**: $0 (free tier - 1M requests)
- **RDS**: $0 (free tier - 750 hours + 20GB)
- **ALB**: $0 (free tier - 750 hours + 15GB)
- **Cognito**: $0.01/month
- **SES**: $0 (free tier - 3,000 messages)
- **Total**: $0.01/month

### Beyond Free Tier
- **CloudFront Pro**: $15/month (if needed)
- **Second EC2 instance**: $15/month (if needed)
- **S3 beyond 5GB**: $0.023/GB
- **Lambda beyond free tier**: $0.20/1M requests

## Recommendation

### For MVP Stage: Keep Marketing on Vercel

**Reasons:**
1. **Focus on Product**: Engineering resources should focus on product backend
2. **Marketing Velocity**: Vercel enables faster marketing iteration
3. **DX Benefits**: Preview deployments, git integration
4. **Free Tier**: Both approaches stay within free tier
5. **Future Flexibility**: Can migrate to AWS later when needed

**When to Reconsider:**
- Marketing requires database integration
- Marketing needs complex personalization
- Team wants single-cloud operations
- Marketing traffic scales significantly

### For Production Stage: Consider AWS Migration

**Trigger Conditions:**
- Marketing needs backend integration (user-specific content)
- Marketing traffic >10K visitors/month
- Marketing has complex dynamic features
- Team wants operational simplification
- Security requires single-cloud model

**Migration Complexity:** 2-3 weeks engineering effort

## Conclusion

**Moving marketing to AWS is technically feasible and free-tier compatible** but introduces additional complexity that may not be warranted for MVP. The recommendation is to keep marketing on Vercel for now and migrate to AWS when business needs justify the operational complexity.

The key decision factors are:
1. **Marketing Complexity**: Static vs dynamic content
2. **Team Maturity**: Engineering capacity vs marketing velocity needs
3. **Operational Preferences**: Single cloud vs cross-cloud
4. **Traffic Scale**: Free tier limits vs actual usage
5. **Time to Market**: MVP speed vs long-term architecture

For most early-stage companies, keeping marketing on Vercel provides better time-to-market while staying within free tier limits.