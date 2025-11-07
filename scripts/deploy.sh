#!/bin/bash

set -e

# Get environment from first argument, or default to preview-$(whoami)
ENVIRONMENT="${1:-preview-$(whoami)}"
# Optional: control asset deployment (defaults to true)
WITH_ASSETS="${WITH_ASSETS:-true}"

echo "Starting AWS CDK deployment to environment: $ENVIRONMENT"
echo "Asset deployment: $WITH_ASSETS"

# Check AWS CLI
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "AWS CLI not configured. Run 'aws configure' first."
    exit 1
fi

# Step 1: Create Secrets Manager secret (idempotent - safe to run multiple times)
echo "Setting up Secrets Manager..."
SECRET_NAME="${ENVIRONMENT}/app-secrets"

if aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" &>/dev/null 2>&1; then
  echo "  ✅ Secret already exists: $SECRET_NAME"
else
  echo "  📝 Creating new secret: $SECRET_NAME"
  aws secretsmanager create-secret \
    --name "$SECRET_NAME" \
    --description "Application secrets for $ENVIRONMENT environment" \
    --secret-string '{"SUPABASE_URL":"PLACEHOLDER","SUPABASE_ANON_KEY":"PLACEHOLDER","SUPABASE_SERVICE_ROLE_KEY":"PLACEHOLDER"}' \
    --tags Key=Environment,Value=$ENVIRONMENT
  echo "  ✅ Secret created with placeholder values"
fi
echo ""

# Install CDK if needed
if ! command -v cdk &> /dev/null; then
    echo "Installing AWS CDK..."
    npm install --no-progress -g aws-cdk
fi

# Install Lambda dependencies
echo "Installing Lambda dependencies..."
for lambda_dir in infra/lambda/*/; do
  if [ -d "$lambda_dir" ] && [ -f "$lambda_dir/package.json" ]; then
    echo "Installing dependencies for $(basename "$lambda_dir")..."
    cd "$lambda_dir"
    npm install --no-progress
    cd - > /dev/null
  fi
done

# Build frontend
if [ "$WITH_ASSETS" = "true" ]; then
    echo "Building frontend..."
    npm run build
else
    echo "Skipping frontend build (WITH_ASSETS=false)"
fi

# Install CDK dependencies
echo "Installing CDK dependencies..."
cd infra
npm install --no-progress
npm run build

# Bootstrap CDK
echo "Bootstrapping CDK..."
cdk bootstrap --progress events

# Deploy stacks with environment context
echo "Deploying CDK stacks for environment: $ENVIRONMENT..."
if [ "$WITH_ASSETS" = "true" ]; then
    cdk deploy --all --context environment=$ENVIRONMENT --require-approval never --progress events
else
    cdk deploy --all --context environment=$ENVIRONMENT --context withAssets=false --require-approval never --progress events
fi

# Get outputs
API_URL=$(aws cloudformation describe-stacks \
    --stack-name StoryclunkApi-${ENVIRONMENT} \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
    --output text 2>/dev/null || echo "N/A")

FRONTEND_URL=$(aws cloudformation describe-stacks \
    --stack-name StoryclunkFrontend-${ENVIRONMENT} \
    --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' \
    --output text)

DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
    --stack-name StoryclunkFrontend-${ENVIRONMENT} \
    --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
    --output text)

SECRETS_ARN=$(aws cloudformation describe-stacks \
    --stack-name StoryclunkApi-${ENVIRONMENT} \
    --query 'Stacks[0].Outputs[?OutputKey==`SecretsArn`].OutputValue' \
    --output text 2>/dev/null || echo "N/A")

# Clear CloudFront cache
if [ "$WITH_ASSETS" = "true" ] && [ "$DISTRIBUTION_ID" != "None" ] && [ -n "$DISTRIBUTION_ID" ]; then
    echo "Clearing CloudFront cache..."
    aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*"
fi

echo ""
echo "Deployment complete for environment: $ENVIRONMENT!"
echo "Frontend URL: $FRONTEND_URL"
if [ "$API_URL" != "N/A" ]; then
    echo "API URL: $API_URL"
fi
echo ""

if [ "$SECRETS_ARN" != "N/A" ]; then
    echo "⚠️  IMPORTANT: Update application secrets with actual values:"
    echo "aws secretsmanager update-secret --secret-id ${ENVIRONMENT}/app-secrets --secret-string '{\"SUPABASE_URL\":\"YOUR_URL\",\"SUPABASE_ANON_KEY\":\"YOUR_KEY\",\"SUPABASE_SERVICE_ROLE_KEY\":\"YOUR_SERVICE_KEY\"}'"
    echo ""
fi

echo "Usage examples:"
echo "  ./scripts/deploy.sh                   # Deploy to preview-\$(whoami)"
echo "  ./scripts/deploy.sh dev               # Deploy to dev"
echo "  ./scripts/deploy.sh prod              # Deploy to production"
echo "  WITH_ASSETS=false ./scripts/deploy.sh # Deploy without updating assets"

