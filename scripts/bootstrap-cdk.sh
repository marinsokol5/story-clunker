#!/bin/bash
set -e

# Bootstrap CDK with trust for pipeline deploy roles
# This script is idempotent and safe to re-run
# Usage: ./scripts/bootstrap-cdk.sh [PIPELINE_STACK_NAME] [BUILD_ROLE_ARN] [DEPLOY_ROLE_ARN]

PIPELINE_STACK_NAME=${1:-"StoryclunkPipelineStack"}
BUILD_ROLE_ARN_INPUT=$2
DEPLOY_ROLE_ARN_INPUT=$3

echo "================================================"
echo "CDK Bootstrap with Pipeline Trust"
echo "================================================"
echo ""

# Get AWS account and region
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_DEFAULT_REGION:-us-east-1}

echo "Target Environment:"
echo "  Account: $ACCOUNT"
echo "  Region:  $REGION"
echo "  Pipeline Stack: $PIPELINE_STACK_NAME"
echo ""

# Check if pipeline stack exists
if ! aws cloudformation describe-stacks --stack-name $PIPELINE_STACK_NAME --region $REGION >/dev/null 2>&1; then
  echo "❌ Error: Pipeline stack '$PIPELINE_STACK_NAME' does not exist"
  echo "   Deploy the pipeline stack first (Step 5):"
  echo "   cdk deploy $PIPELINE_STACK_NAME --context codeConnectionArn=\$CODE_CONNECTION_ARN ..."
  exit 1
fi

# Extract role ARNs from stack outputs (if not provided as arguments)
if [ -z "$BUILD_ROLE_ARN_INPUT" ]; then
  echo "Extracting BuildRole ARN from stack outputs..."
  BUILD_ROLE_ARN=$(aws cloudformation describe-stacks \
    --stack-name $PIPELINE_STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`BuildRoleArn`].OutputValue' \
    --output text)
else
  BUILD_ROLE_ARN=$BUILD_ROLE_ARN_INPUT
fi

if [ -z "$DEPLOY_ROLE_ARN_INPUT" ]; then
  echo "Extracting DeployRole ARN from stack outputs..."
  DEPLOY_ROLE_ARN=$(aws cloudformation describe-stacks \
    --stack-name $PIPELINE_STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`DeployRoleArn`].OutputValue' \
    --output text)
else
  DEPLOY_ROLE_ARN=$DEPLOY_ROLE_ARN_INPUT
fi

# Validate role ARNs were found
if [ -z "$BUILD_ROLE_ARN" ] || [ "$BUILD_ROLE_ARN" = "None" ]; then
  echo "⚠️  Warning: BuildRoleArn not found in stack outputs"
  BUILD_ROLE_ARN=""
fi

if [ -z "$DEPLOY_ROLE_ARN" ] || [ "$DEPLOY_ROLE_ARN" = "None" ]; then
  echo "❌ Error: DeployRoleArn not found in stack outputs"
  echo "   Ensure your pipeline stack exports DeployRoleArn as an output"
  exit 1
fi

echo ""
echo "Pipeline Roles:"
if [ -n "$BUILD_ROLE_ARN" ]; then
  echo "  BuildRole:  $BUILD_ROLE_ARN"
fi
echo "  DeployRole: $DEPLOY_ROLE_ARN"
echo ""

# Check if CDK bootstrap already exists
echo "Checking CDK bootstrap status..."
if aws cloudformation describe-stacks --stack-name CDKToolkit --region $REGION >/dev/null 2>&1; then
  BOOTSTRAP_VERSION=$(aws ssm get-parameter \
    --name /cdk-bootstrap/hnb659fds/version \
    --region $REGION \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || echo "unknown")

  echo "✓ CDK bootstrap stack exists (version: $BOOTSTRAP_VERSION)"
  echo "  Updating trust policy for pipeline roles..."
else
  echo "ℹ️  CDK bootstrap stack does not exist"
  echo "  Creating new bootstrap with pipeline trust..."
fi

echo ""
echo "Running CDK bootstrap..."
echo ""

# Build trust arguments
TRUST_ARGS="--trust $DEPLOY_ROLE_ARN"
if [ -n "$BUILD_ROLE_ARN" ]; then
  TRUST_ARGS="$TRUST_ARGS --trust $BUILD_ROLE_ARN"
fi

# Execute bootstrap (idempotent - safe to re-run)
npx cdk bootstrap aws://$ACCOUNT/$REGION \
  $TRUST_ARGS \
  --cloudformation-execution-policies "arn:aws:iam::aws:policy/AdministratorAccess" \
  --verbose

echo ""
echo "================================================"
echo "SUCCESS: CDK bootstrap completed successfully"
echo "================================================"
echo ""
echo "The pipeline can now deploy CDK stacks."
echo ""

