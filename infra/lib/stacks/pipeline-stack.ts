import * as cdk from "aws-cdk-lib";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";
import { CodeBuildRole, ArtifactsBucket } from "../shared-constructs";

export interface PipelineStackProps extends cdk.StackProps {
  codeConnectionArn: string;
  repositoryName: string;
  branchName: string;
}

export class PipelineStack extends cdk.Stack {
  public readonly pipeline: codepipeline.Pipeline;
  public readonly artifactsBucket: s3.Bucket;
  private readonly props: PipelineStackProps;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);
    this.props = props;

    // Create artifacts bucket
    this.artifactsBucket = new ArtifactsBucket(this, "ArtifactsBucket").bucket;

    // Create SNS topic for notifications
    const notificationTopic = new sns.Topic(this, "PipelineNotifications", {
      displayName: "Pipeline Notifications",
    });

    // Create CodeBuild roles
    const qualityRole = new CodeBuildRole(this, "QualityRole", {
      allowSecretsManager: true,
      allowS3Artifacts: true,
    });

    const buildRole = new CodeBuildRole(this, "BuildRole", {
      allowSecretsManager: true,
      allowS3Artifacts: true,
      allowCloudFormation: true,
      allowCdkBootstrap: true,
      additionalPolicies: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "lambda:GetFunction",
            "lambda:GetFunctionConfiguration",
            "lambda:GetAlias",
            "lambda:ListAliases",
          ],
          resources: ["arn:aws:lambda:*:*:function:*"],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "cloudfront:GetDistribution",
            "cloudfront:GetDistributionConfig",
          ],
          resources: ["*"],
        }),
      ],
    });

    const deployRole = new CodeBuildRole(this, "DeployRole", {
      allowSecretsManager: true,
      allowS3Artifacts: true,
      allowCloudFormation: true,
      allowCdkBootstrap: true,
      additionalPolicies: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "s3:ListBucket",
            "s3:GetBucketLocation",
            "s3:GetObject",
            "s3:PutObject",
            "s3:DeleteObject",
          ],
          resources: [
            `arn:aws:s3:::storyclunkfrontend-*`,
            `arn:aws:s3:::storyclunkfrontend-*/*`,
          ],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "cloudfront:CreateInvalidation",
            "cloudfront:GetInvalidation",
            "cloudfront:ListInvalidations",
          ],
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "lambda:UpdateFunctionCode",
            "lambda:GetFunction",
            "lambda:GetAlias",
            "lambda:UpdateAlias",
          ],
          resources: ["arn:aws:lambda:*:*:function:*"],
        }),
      ],
    });

    // Create CodeBuild projects
    const lintTypeSecretsProject = this.createLintTypeSecretsProject(
      qualityRole.role
    );
    const unitTestsProject = this.createUnitTestsProject(qualityRole.role);
    const depScanProject = this.createDepScanProject(qualityRole.role);
    const frontendBuildProject = this.createFrontendBuildProject(
      buildRole.role
    );
    const backendBuildProject = this.createBackendBuildProject(buildRole.role);
    const iacSynthProject = this.createIacSynthProject(buildRole.role);
    const deployFrontendProject = this.createDeployFrontendProject(
      deployRole.role
    );
    const deployBackendProject = this.createDeployBackendProject(
      deployRole.role
    );
    const updatePipelineProject = this.createUpdatePipelineProject(
      deployRole.role
    );
    const healthCheckProject = this.createHealthCheckProject(qualityRole.role);

    // Define pipeline artifacts
    const artifacts = {
      source: new codepipeline.Artifact("SourceOutput"),
      lint: new codepipeline.Artifact("LintTypeSecretsOutput"),
      unit: new codepipeline.Artifact("UnitTestsOutput"),
      depScan: new codepipeline.Artifact("DepScanOutput"),
      frontendBuild: new codepipeline.Artifact("FrontendBuildOutput"),
      backendBuild: new codepipeline.Artifact("BackendBuildOutput"),
      iacSynth: new codepipeline.Artifact("IacSynthOutput"),
    };

    const [owner, repo] = props.repositoryName.split("/");

    // Define pipeline stages
    const stages: codepipeline.StageProps[] = [
      {
        stageName: "Source",
        actions: [
          new codepipeline_actions.CodeStarConnectionsSourceAction({
            actionName: "Source",
            owner,
            repo,
            branch: props.branchName,
            connectionArn: props.codeConnectionArn,
            output: artifacts.source,
            triggerOnPush: true,
          }),
        ],
      },
      {
        stageName: "UpdatePipeline",
        actions: [
          new codepipeline_actions.CodeBuildAction({
            actionName: "UpdatePipeline",
            project: updatePipelineProject,
            input: artifacts.source,
          }),
        ],
      },
      {
        stageName: "Quality",
        actions: [
          new codepipeline_actions.CodeBuildAction({
            actionName: "LintTypeSecrets",
            project: lintTypeSecretsProject,
            input: artifacts.source,
            outputs: [artifacts.lint],
          }),
          new codepipeline_actions.CodeBuildAction({
            actionName: "UnitTests",
            project: unitTestsProject,
            input: artifacts.source,
            outputs: [artifacts.unit],
          }),
          new codepipeline_actions.CodeBuildAction({
            actionName: "DepScan",
            project: depScanProject,
            input: artifacts.source,
            outputs: [artifacts.depScan],
          }),
        ],
      },
      {
        stageName: "Build",
        actions: [
          new codepipeline_actions.CodeBuildAction({
            actionName: "FrontendBuild",
            project: frontendBuildProject,
            input: artifacts.source,
            outputs: [artifacts.frontendBuild],
          }),
          new codepipeline_actions.CodeBuildAction({
            actionName: "BackendBuild",
            project: backendBuildProject,
            input: artifacts.source,
            outputs: [artifacts.backendBuild],
          }),
          new codepipeline_actions.CodeBuildAction({
            actionName: "IacSynth",
            project: iacSynthProject,
            input: artifacts.source,
            outputs: [artifacts.iacSynth],
          }),
        ],
      },
      {
        stageName: "DeployDev",
        actions: [
          new codepipeline_actions.CodeBuildAction({
            actionName: "DeployBackendDev",
            project: deployBackendProject,
            input: artifacts.source,
            extraInputs: [artifacts.backendBuild, artifacts.iacSynth],
            environmentVariables: {
              ENVIRONMENT: { value: "dev" },
              LAMBDA_FUNCTION_PREFIX: { value: "StoryclunkApiStack" },
            },
            runOrder: 1,
          }),
          new codepipeline_actions.CodeBuildAction({
            actionName: "DeployFrontendDev",
            project: deployFrontendProject,
            input: artifacts.source,
            extraInputs: [artifacts.frontendBuild],
            outputs: [new codepipeline.Artifact("FrontendDeployDev")],
            environmentVariables: {
              ENVIRONMENT: { value: "dev" },
            },
            runOrder: 2,
          }),
        ],
      },
      {
        stageName: "ManualApproval",
        actions: [
          new codepipeline_actions.ManualApprovalAction({
            actionName: "ApproveProductionDeployment",
            additionalInformation:
              "Review dev deployment and approve production deployment",
          }),
        ],
      },
      {
        stageName: "DeployProd",
        actions: [
          new codepipeline_actions.CodeBuildAction({
            actionName: "DeployBackendProd",
            project: deployBackendProject,
            input: artifacts.source,
            extraInputs: [artifacts.backendBuild, artifacts.iacSynth],
            environmentVariables: {
              ENVIRONMENT: { value: "prod" },
              LAMBDA_FUNCTION_PREFIX: { value: "StoryclunkApiStack" },
            },
            runOrder: 1,
          }),
          new codepipeline_actions.CodeBuildAction({
            actionName: "DeployFrontendProd",
            project: deployFrontendProject,
            input: artifacts.source,
            extraInputs: [artifacts.frontendBuild],
            outputs: [new codepipeline.Artifact("FrontendDeployProd")],
            environmentVariables: {
              ENVIRONMENT: { value: "prod" },
            },
            runOrder: 2,
          }),
          new codepipeline_actions.CodeBuildAction({
            actionName: "HealthCheckProd",
            project: healthCheckProject,
            input: artifacts.source,
            extraInputs: [new codepipeline.Artifact("FrontendDeployProd")],
            environmentVariables: {
              ENVIRONMENT: { value: "prod" },
            },
            runOrder: 3,
          }),
        ],
      },
    ];

    // Create pipeline
    this.pipeline = new codepipeline.Pipeline(this, "Pipeline", {
      pipelineName: "StoryclunkPipeline",
      pipelineType: codepipeline.PipelineType.V2,
      artifactBucket: this.artifactsBucket,
      stages,
    });

    // Add CloudWatch alarms
    this.createPipelineAlarms();

    // Subscribe to notifications
    this.pipeline.notifyOnExecutionStateChange(
      "PipelineExecutionNotifications",
      notificationTopic
    );

    // Outputs
    new cdk.CfnOutput(this, "PipelineName", {
      value: this.pipeline.pipelineName,
      description: "CodePipeline Name",
    });

    new cdk.CfnOutput(this, "BuildRoleArn", {
      value: buildRole.role.roleArn,
      description: "CodeBuild Build Role ARN (for CDK bootstrap trust)",
      exportName: `${this.stackName}-BuildRoleArn`,
    });

    new cdk.CfnOutput(this, "DeployRoleArn", {
      value: deployRole.role.roleArn,
      description: "CodeBuild Deploy Role ARN (for CDK bootstrap trust)",
      exportName: `${this.stackName}-DeployRoleArn`,
    });
  }

  private createUpdatePipelineProject(
    role: iam.Role
  ): codebuild.PipelineProject {
    return new codebuild.PipelineProject(this, "UpdatePipelineProject", {
      projectName: "Storyclunk-UpdatePipeline",
      role,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        "buildspecs/update_pipeline.yml"
      ),
      environmentVariables: {
        REPOSITORY_NAME: { value: this.props.repositoryName },
        BRANCH_NAME: { value: this.props.branchName },
        CODE_CONNECTION_ARN: { value: this.props.codeConnectionArn },
      },
    });
  }

  private createLintTypeSecretsProject(
    role: iam.Role
  ): codebuild.PipelineProject {
    return new codebuild.PipelineProject(this, "LintTypeSecretsProject", {
      projectName: "Storyclunk-LintTypeSecrets",
      role,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        "buildspecs/lint_type_secrets.yml"
      ),
    });
  }

  private createUnitTestsProject(role: iam.Role): codebuild.PipelineProject {
    return new codebuild.PipelineProject(this, "UnitTestsProject", {
      projectName: "Storyclunk-UnitTests",
      role,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        "buildspecs/unit_tests.yml"
      ),
    });
  }

  private createDepScanProject(role: iam.Role): codebuild.PipelineProject {
    return new codebuild.PipelineProject(this, "DepScanProject", {
      projectName: "Storyclunk-DepScan",
      role,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        "buildspecs/dep_scan.yml"
      ),
    });
  }

  private createFrontendBuildProject(
    role: iam.Role
  ): codebuild.PipelineProject {
    return new codebuild.PipelineProject(this, "FrontendBuildProject", {
      projectName: "Storyclunk-FrontendBuild",
      role,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        "buildspecs/frontend_build.yml"
      ),
    });
  }

  private createBackendBuildProject(role: iam.Role): codebuild.PipelineProject {
    return new codebuild.PipelineProject(this, "BackendBuildProject", {
      projectName: "Storyclunk-BackendBuild",
      role,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        "buildspecs/backend_build.yml"
      ),
    });
  }

  private createIacSynthProject(role: iam.Role): codebuild.PipelineProject {
    return new codebuild.PipelineProject(this, "IacSynthProject", {
      projectName: "Storyclunk-IacSynth",
      role,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: false,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        "buildspecs/iac_synth_diff_checkov.yml"
      ),
    });
  }

  private createDeployFrontendProject(
    role: iam.Role
  ): codebuild.PipelineProject {
    return new codebuild.PipelineProject(this, "DeployFrontendProject", {
      projectName: "Storyclunk-DeployFrontend",
      role,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        "buildspecs/deploy_frontend.yml"
      ),
    });
  }

  private createDeployBackendProject(
    role: iam.Role
  ): codebuild.PipelineProject {
    return new codebuild.PipelineProject(this, "DeployBackendProject", {
      projectName: "Storyclunk-DeployBackend",
      role,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        "buildspecs/deploy_backend.yml"
      ),
    });
  }

  private createHealthCheckProject(role: iam.Role): codebuild.PipelineProject {
    return new codebuild.PipelineProject(this, "HealthCheckProject", {
      projectName: "Storyclunk-HealthCheck",
      role,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        "buildspecs/health_check.yml"
      ),
    });
  }

  private createPipelineAlarms(): void {
    new cloudwatch.Alarm(this, "PipelineFailures", {
      metric: new cloudwatch.Metric({
        namespace: "AWS/CodePipeline",
        metricName: "FailedExecutions",
        dimensionsMap: { PipelineName: this.pipeline.pipelineName },
        statistic: "Sum",
        period: cdk.Duration.hours(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Alert when pipeline execution fails",
    });
  }
}

