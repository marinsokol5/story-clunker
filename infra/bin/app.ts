#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ApiStack } from "../lib/stacks/api-stack";
import { FrontendStack } from "../lib/stacks/frontend-stack";
import { PipelineStack } from "../lib/stacks/pipeline-stack";
import { execSync } from "child_process";

const app = new cdk.App();

// Get environment variables
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || "us-east-1";

// Get context values
const codeConnectionArn = app.node.tryGetContext("codeConnectionArn");
const repositoryName =
  app.node.tryGetContext("repositoryName") || "marinsokol5/story-clunker";
const branchName = app.node.tryGetContext("branchName") || "main";
const pipelineOnly = app.node.tryGetContext("pipelineOnly") === "true";

// ========================================================================
// DEPLOYMENT STRATEGY
// ========================================================================
// This CDK app supports two deployment modes:
//
// 1. Pipeline Mode (pipelineOnly=true):
//    - Creates ONLY PipelineStack (CI/CD infrastructure)
//    - Used when deploying the pipeline itself
//    - Command: cdk deploy --context pipelineOnly=true
//
// 2. Application Mode (pipelineOnly=false or not set):
//    - Creates ApiStack and FrontendStack for dev/prod environments
//    - Used by the pipeline's buildspecs to deploy application stacks
//    - Also used by run-deployment-assistant for preview environments
//
// Preview vs Dev/Prod environments:
// - Preview (preview-<username>): Created by deployment-assistant for local testing
// - Dev/Prod: Created by THIS pipeline for team-shared environments
// ========================================================================

// Create per-environment stacks (only if not pipeline-only mode)
if (!pipelineOnly) {
  const getDefaultEnvironment = (): string => {
    try {
      const username = process.env.USER || execSync("whoami").toString().trim();
      return `preview-${username}`;
    } catch {
      return "preview-local";
    }
  };

  const environment =
    app.node.tryGetContext("environment") || getDefaultEnvironment();
  const buildOutputPath = app.node.tryGetContext("buildPath") || "../dist";

  // Create API stack
  const apiStack = new ApiStack(app, `StoryclunkApi-${environment}`, {
    env: { account, region },
    environment,
    description: `API Gateway and Lambda functions - ${environment}`,
  });

  // Create frontend stack with API integration
  const frontendStack = new FrontendStack(app, `StoryclunkFrontend-${environment}`, {
    env: { account, region },
    environment,
    buildOutputPath,
    apiGatewayDomain: apiStack.apiGatewayDomain,
    description: `Frontend with Supabase integration - ${environment}`,
  });

  // Frontend depends on API
  frontendStack.addDependency(apiStack);

  // Add environment-specific tags
  cdk.Tags.of(apiStack).add("Environment", environment);
  cdk.Tags.of(frontendStack).add("Environment", environment);
}

// Create pipeline stack (only if CodeConnection ARN is provided)
if (codeConnectionArn) {
  new PipelineStack(app, "StoryclunkPipelineStack", {
    env: { account, region },
    description: "CI/CD Pipeline for Storyclunk",
    codeConnectionArn,
    repositoryName,
    branchName,
  });
} else {
  console.warn(
    "⚠️  CodeConnection ARN not provided. Pipeline stack will not be created.",
  );
  console.warn(
    "   Create connection: See Step 1.9 in setup-codepipeline script",
  );
}

// Add global tags
cdk.Tags.of(app).add("Project", "Storyclunk");
cdk.Tags.of(app).add("ManagedBy", "CDK");

