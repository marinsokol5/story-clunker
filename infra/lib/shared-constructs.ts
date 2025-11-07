import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import { Construct } from "constructs";

export interface CodeBuildRoleProps {
  allowSecretsManager?: boolean;
  allowS3Artifacts?: boolean;
  allowCloudFormation?: boolean;
  allowCdkBootstrap?: boolean;
  additionalPolicies?: iam.PolicyStatement[];
}

export class CodeBuildRole extends Construct {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: CodeBuildRoleProps = {}) {
    super(scope, id);

    const {
      allowSecretsManager = false,
      allowS3Artifacts = false,
      allowCloudFormation = false,
      allowCdkBootstrap = false,
      additionalPolicies = [],
    } = props;

    const statements: iam.PolicyStatement[] = [];

    if (allowSecretsManager) {
      statements.push(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["secretsmanager:GetSecretValue"],
          resources: ["*"],
        })
      );
    }

    if (allowS3Artifacts) {
      const account = cdk.Stack.of(this).account;
      statements.push(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "s3:GetObject",
            "s3:PutObject",
            "s3:ListBucket",
          ],
          resources: [
            `arn:aws:s3:::storyclunk-pipeline-artifacts-${account}/*`,
            `arn:aws:s3:::storyclunk-pipeline-artifacts-${account}`,
          ],
        })
      );
    }

    if (allowCloudFormation) {
      statements.push(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "cloudformation:DescribeStacks",
            "cloudformation:DescribeStackEvents",
            "cloudformation:DescribeStackResource",
            "cloudformation:DescribeStackResources",
            "cloudformation:GetTemplate",
            "cloudformation:CreateStack",
            "cloudformation:UpdateStack",
            "cloudformation:DeleteStack",
            "cloudformation:CreateChangeSet",
            "cloudformation:DescribeChangeSet",
            "cloudformation:ExecuteChangeSet",
          ],
          resources: ["*"],
        })
      );
    }

    if (allowCdkBootstrap) {
      statements.push(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "cloudformation:*",
            "ssm:GetParameter",
            "ssm:PutParameter",
            "ssm:DeleteParameter",
            "s3:GetObject",
            "s3:PutObject",
            "s3:ListBucket",
            "iam:CreateRole",
            "iam:DeleteRole",
            "iam:GetRole",
            "iam:PassRole",
            "iam:AttachRolePolicy",
            "iam:DetachRolePolicy",
            "iam:PutRolePolicy",
            "iam:DeleteRolePolicy",
            "iam:GetRolePolicy",
            "iam:TagRole",
          ],
          resources: ["*"],
        })
      );
    }

    statements.push(...additionalPolicies);

    this.role = new iam.Role(this, "Role", {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      description: `CodeBuild role for ${id}`,
      inlinePolicies: {
        CodeBuildPolicy: new iam.PolicyDocument({
          statements,
        }),
      },
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchLogsFullAccess"
        ),
      ],
    });
  }
}

export class ArtifactsBucket extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const account = cdk.Stack.of(this).account;

    this.bucket = new s3.Bucket(this, "Bucket", {
      bucketName: `storyclunk-pipeline-artifacts-${account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [
        {
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
        {
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
  }
}

