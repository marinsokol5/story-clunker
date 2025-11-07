# Deployment Skill

## Overview

This skill provides deployment guidance for AWS applications using two primary methods:
1. **Local Development Deployment** - Deploy to personal preview environment for testing
2. **CI/CD Pipeline Deployment** - Deploy to test/production environments via git push

## Local Development Deployment

### Prerequisites
- AWS CLI configured with appropriate credentials
- AWS CDK CLI installed (`npm install -g aws-cdk`)
- CDK infrastructure code generated (via `run-deployment-assistant`)
- `scripts/deploy.sh` exists and is executable

### Deployment Process

#### 1. Check Deployment Script
- Check that `scripts/deploy.sh` exists in the project root
- Verify the script is executable: `chmod +x scripts/deploy.sh`
- Review the script to ensure it matches your application type

#### 2. Request User Confirmation

**CRITICAL - Pricing Disclaimer:**
- DO NOT provide any cost estimates, pricing information, or monthly cost projections
- DO NOT discuss or speculate about AWS service costs
- If user asks about costs, redirect them to AWS Pricing Calculator: https://calculator.aws

Before executing the deployment, you MUST:
- Inform the user that the deployment will create AWS resources that may incur costs
- Include this disclaimer: "AWS pricing varies based on usage patterns, selected regions, and specific configurations. For accurate cost estimates tailored to your requirements, please use the AWS Pricing Calculator: https://calculator.aws"
- List the AWS resources that will be created (S3 buckets, CloudFront distribution, Lambda functions, API Gateway, etc.)
- Ask the user to explicitly confirm they want to proceed with the deployment
- Wait for user confirmation before proceeding to the next step
- If the user declines, stop the deployment process and provide instructions for manual deployment

#### 3. Execute Deployment
After receiving user confirmation, you MUST:
- Run the deployment script: `./scripts/deploy.sh [environment]`
- Monitor the deployment progress
- Capture outputs:
  - Frontend URL (CloudFront distribution or Amplify URL)
  - API Gateway URL (if applicable)
  - Load Balancer URL (if applicable)
  - Service URL (App Runner, if applicable)
  - CloudFront Distribution ID (if applicable)
  - Secrets ARN (if applicable)
  - ECR Repository URI (if applicable)

### Environment Strategy
- **Preview**: `preview-${whoami}` - Personal preview environment (default)
- Automatically isolated per developer
- Safe for experimentation and testing

### Available NPM Scripts
```bash
# Deploy to preview environment (default)
npm run deploy
npm run deploy:preview

# Other useful commands
npm run destroy    # Delete all resources
npm run synth      # Generate CloudFormation templates
npm run diff       # Show changes before deployment
```

## CI/CD Pipeline Deployment

### Prerequisites
- CI/CD pipeline created and connected to git repository

### Deployment Process

A CodePipeline has been connected to your git repository. To deploy changes:

1. **Check for uncommitted changes**
   ```bash
   git status
   ```

2. **Commit changes if needed**
   - If there are uncommitted changes, ask the user if they want to commit them
   - If yes, commit the changes with an appropriate message

3. **Push to trigger deployment**
   ```bash
   git push
   ```

## Cleanup

### Remove Personal Preview Environment
```bash
cd infra
cdk destroy --all

# Using npm scripts
npm run destroy
```

## Troubleshooting

### Common Issues
- **CDK Bootstrap Required**: Run `cdk bootstrap` if deployment fails
- **Permission Errors**: Verify AWS credentials and IAM permissions
- **Resource Limits**: Check AWS service quotas in target region
- **Name Conflicts**: Ensure resource names are unique across environments

### Deployment Verification
- Check CloudFormation stacks in AWS Console
- Verify all outputs are captured correctly
- Test application functionality thoroughly
- Monitor CloudWatch logs for errors

