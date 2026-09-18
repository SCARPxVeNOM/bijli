#!/usr/bin/env bash
# Stands up BijliSaathi's spec architecture (API Gateway + Lambda, Step
# Functions, DynamoDB, EventBridge, S3) against LocalStack, running entirely
# on this machine -- no AWS account, card, or bill. See infra/README.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

export PATH="$PATH:$HOME/Library/Python/3.9/bin:/Applications/Docker.app/Contents/Resources/bin:$ROOT_DIR/node_modules/.bin"
STACK_NAME="bijlisaathi-local"

echo "==> Building workspace packages (domain, data, core, server)"
cd "$ROOT_DIR"
npm run build:server

echo "==> Starting LocalStack (docker compose)"
cd "$SCRIPT_DIR"
docker compose up -d

echo "==> Waiting for LocalStack to be ready"
until curl -sf http://localhost:4566/_localstack/health | grep -q '"dynamodb": "\(available\|running\)"'; do
  sleep 2
done
echo "    LocalStack is up."

echo "==> Building the Lambda functions (samlocal build)"
samlocal build --template template.yaml

echo "==> Deploying the stack to LocalStack (samlocal deploy)"
samlocal deploy \
  --stack-name "$STACK_NAME" \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset

echo
echo "==> Stack outputs"
API_URL=$(awslocal cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
STATE_MACHINE_ARN=$(awslocal cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='StateMachineArn'].OutputValue" --output text)

echo "API base URL:      $API_URL"
echo "State machine ARN: $STATE_MACHINE_ARN"
echo
echo "Try it:"
echo "  curl $API_URL/health"
echo "  curl -X POST $API_URL/api/households -H 'Content-Type: application/json' -d '{\"phone\":\"+91-demo\"}'"
echo
echo "Run the daily pipeline once (fetch -> forecast -> risk -> plan -> send):"
echo "  awslocal stepfunctions start-execution --state-machine-arn $STATE_MACHINE_ARN --input '{}'"
echo
echo "Inspect what landed in DynamoDB:"
echo "  awslocal dynamodb scan --table-name \$(awslocal cloudformation describe-stack-resources --stack-name $STACK_NAME --query \"StackResources[?LogicalResourceId=='PlansTable'].PhysicalResourceId\" --output text)"
