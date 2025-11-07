import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import * as path from "path";
import * as fs from "fs";

export interface ApiStackProps extends cdk.StackProps {
  environment: string;
}

export class ApiStack extends cdk.Stack {
  public readonly apiUrl: string;
  public readonly apiGatewayDomain: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Reference existing Secrets Manager secret (created by deploy.sh)
    const appSecrets = secretsmanager.Secret.fromSecretNameV2(
      this,
      "AppSecrets",
      `${environment}/app-secrets`
    );

    // IAM role for Lambda functions
    const lambdaRole = new iam.Role(this, "LambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: `Lambda execution role for ${id}`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
      inlinePolicies: {
        BedrockAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream",
              ],
              resources: [
                "arn:aws:bedrock:*:*:inference-profile/*",
                "arn:aws:bedrock:*::foundation-model/*",
              ],
            }),
          ],
        }),
        SecretsAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["secretsmanager:GetSecretValue"],
              resources: [`${appSecrets.secretArn}*`],
            }),
          ],
        }),
      },
    });

    // API Gateway with CloudWatch logging
    const logGroup = new logs.LogGroup(this, "ApiLogGroup", {
      logGroupName: `/aws/apigateway/${id}`,
      retention: environment === "prod" ? logs.RetentionDays.INFINITE : logs.RetentionDays.ONE_WEEK,
      removalPolicy: environment === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const api = new apigateway.RestApi(this, "Api", {
      restApiName: id,
      description: `API for ${id}`,
      deployOptions: {
        stageName: "api",
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
        accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
      },
    });

    // Discover Lambda functions dynamically
    const lambdaDir = path.join(__dirname, "../../lambda");
    
    if (fs.existsSync(lambdaDir)) {
      const functionDirs = fs
        .readdirSync(lambdaDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      functionDirs.forEach((functionName) => {
        const functionPath = path.join(lambdaDir, functionName);

        // Create Lambda function
        const lambdaFunction = new lambda.Function(
          this,
          `${functionName}Function`,
          {
            functionName: `${id}-${functionName}`,
            runtime: lambda.Runtime.NODEJS_LATEST,
            handler: "index.handler",
            code: lambda.Code.fromAsset(functionPath),
            role: lambdaRole,
            environment: {
              SECRETS_ARN: appSecrets.secretArn,
              ENVIRONMENT: environment,
            },
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            description: `${functionName} function for ${environment}`,
          }
        );

        // Log retention for Lambda
        new logs.LogRetention(this, `${functionName}LogRetention`, {
          logGroupName: `/aws/lambda/${id}-${functionName}`,
          retention: environment === "prod" ? logs.RetentionDays.INFINITE : logs.RetentionDays.ONE_WEEK,
          removalPolicy: environment === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });

        // Create API Gateway resource and method
        const resource = api.root.addResource(functionName);
        const integration = new apigateway.LambdaIntegration(lambdaFunction, {
          proxy: true,
          allowTestInvoke: true,
        });

        resource.addMethod("POST", integration, {
          authorizationType: apigateway.AuthorizationType.NONE,
        });

        resource.addMethod("GET", integration, {
          authorizationType: apigateway.AuthorizationType.NONE,
        });

        // Output Lambda ARN
        new cdk.CfnOutput(this, `${functionName}FunctionArn`, {
          value: lambdaFunction.functionArn,
          description: `${functionName} Lambda ARN`,
          exportName: `${id}-${functionName}-Arn`,
        });
      });
    }

    // Store API URL details
    this.apiUrl = api.url;
    this.apiGatewayDomain = `${api.restApiId}.execute-api.${this.region}.amazonaws.com`;

    // Outputs
    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "API Gateway URL",
      exportName: `${id}-ApiUrl`,
    });

    new cdk.CfnOutput(this, "ApiId", {
      value: api.restApiId,
      description: "API Gateway ID",
      exportName: `${id}-ApiId`,
    });

    new cdk.CfnOutput(this, "SecretsArn", {
      value: appSecrets.secretArn,
      description: "Application Secrets ARN",
      exportName: `${id}-SecretsArn`,
    });

    // Tags
    cdk.Tags.of(this).add("Stack", "Api");
    cdk.Tags.of(this).add("Environment", environment);
  }
}

