#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ApiStack } from "../lib/stacks/api-stack";
import { FrontendStack } from "../lib/stacks/frontend-stack";
import { execSync } from "child_process";

const app = new cdk.App();

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
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || "us-east-1";
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

// Global tags
cdk.Tags.of(app).add("Project", "Storyclunk");
cdk.Tags.of(app).add("ManagedBy", "CDK");
cdk.Tags.of(app).add("Environment", environment);

