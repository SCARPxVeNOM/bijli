# BijliSaathi infra — SAM CLI + LocalStack

This runs the spec's actual AWS architecture -- API Gateway, Lambda, Step
Functions, DynamoDB, EventBridge, S3 -- entirely on your machine via
[LocalStack](https://localstack.cloud), with no AWS account, card, or bill.
It reuses the exact same Express app and `@bijli/core` business logic as the
Railway deployment; only the backing store changes (DynamoDB instead of a
JSON file) and the transport changes (API Gateway instead of a raw socket).

**Not public.** Everything here is bound to `localhost:4566` on whichever
machine runs `docker compose` -- there is no public URL, and none of this is
reachable from another machine or the internet. For a public link, use the
Railway deployment (see the root `README.md`); this track exists to prove
out the spec's real AWS architecture locally, not to serve traffic.

## One-time setup

```bash
brew install aws-sam-cli awscli
pip3 install --user aws-sam-cli-local awscli-local   # samlocal, awslocal
npm install -g esbuild   # or rely on the repo root's node_modules/.bin/esbuild
```

Docker must be installed and running (`docker info` should succeed).

Make sure these are on your `PATH` for this shell session (the ones
installed via `pip3 install --user` land in `~/Library/Python/3.9/bin` on a
stock macOS Python):

```bash
export PATH="$PATH:$HOME/Library/Python/3.9/bin:/Applications/Docker.app/Contents/Resources/bin"
```

## Deploy

```bash
./infra/deploy-local.sh
```

This builds the workspace, starts LocalStack (`docker compose up -d`),
builds the three Lambda functions with `samlocal build` (esbuild bundles
each one straight from TypeScript, following the npm workspace's
`@bijli/core`/`@bijli/domain`/`@bijli/server` imports), and deploys the SAM
template with `samlocal deploy`. It prints the API's local invoke URL and
the state machine's ARN.

**Important image pin:** `docker-compose.yml` pins
`localstack/localstack:3.8.1`. The `latest` tag now resolves to a build that
demands a `LOCALSTACK_AUTH_TOKEN` (LocalStack Pro) before it will even start
-- this pinned tag runs as `"edition": "community"`, no signup or token
needed. If you bump the version, confirm `curl http://localhost:4566/_localstack/health`
still reports `"edition": "community"` before relying on it.

## Try it

LocalStack's REST API Gateway isn't reachable at the `execute-api.amazonaws.com`
hostname SAM prints (that's a real-AWS-shaped URL for reference/parity) --
use the local invoke path instead:

```bash
export PATH="$PATH:$HOME/Library/Python/3.9/bin"
API_ID=$(awslocal apigateway get-rest-apis --query "items[0].id" --output text)
BASE="http://localhost:4566/restapis/$API_ID/Prod/_user_request_"

curl $BASE/health
curl -X POST $BASE/api/households -H 'Content-Type: application/json' -d '{"phone":"+91-demo"}'
# ...then /language, /pincode, /bill, /bill/confirm, /appliances -- same API as apps/server.
```

Run the daily pipeline once (fetch -> forecast -> risk -> plan -> send, fanned
out over every onboarded household via a Step Functions Map state):

```bash
SM_ARN=$(awslocal cloudformation describe-stacks --stack-name bijlisaathi-local \
  --query "Stacks[0].Outputs[?OutputKey=='StateMachineArn'].OutputValue" --output text)
awslocal stepfunctions start-execution --state-machine-arn "$SM_ARN" --input '{}'
awslocal stepfunctions describe-execution --execution-arn <executionArn-from-above>
```

Inspect what landed in DynamoDB:

```bash
TABLE=$(awslocal cloudformation describe-stack-resources --stack-name bijlisaathi-local \
  --query "StackResources[?LogicalResourceId=='PlansTable'].PhysicalResourceId" --output text)
awslocal dynamodb scan --table-name "$TABLE"
```

## What's real here vs. the Railway deployment

| | Railway (apps/server + apps/web) | This (infra/) |
| --- | --- | --- |
| Store | `JsonDb` (JSON file) | `DynamoDbStore` (real DynamoDB, via LocalStack) |
| Transport | Express + `.listen()` | Same Express app, wrapped with `serverless-http`, behind API Gateway |
| Daily pipeline | `node-cron` in-process | Step Functions state machine, EventBridge-scheduled |
| LLM | Gemini (or Anthropic/mock) via `GEMINI_API_KEY` | Mock by default -- add `GEMINI_API_KEY` to the SAM template's `Globals.Function.Environment.Variables` to use Gemini here too |
| Raw data | Not persisted | `RawDataBucket` (S3) declared, matching the spec's architecture table -- not yet written to by any handler |

`packages/core/src/db.ts` (the `Store` interface) is what makes this
possible without touching `HouseholdService` or any route: `JsonDb` and
`DynamoDbStore` both implement it, and `HouseholdService` only ever depends
on the interface.

## Networking note (why AWS_ENDPOINT_URL is what it is)

Lambda functions run in LocalStack's own Docker containers, separate from
the main LocalStack container -- so `http://localhost:4566` from *inside* a
Lambda would point at the Lambda container itself, not LocalStack. The SAM
template's `Globals.Function.Environment.Variables.AWS_ENDPOINT_URL` is set
to `http://localhost.localstack.cloud:4566`, a DNS name LocalStack provides
that resolves correctly from both the host and its Lambda containers. This
was verified working end-to-end (the Step Functions pipeline above
successfully wrote to DynamoDB from inside a Lambda).

## Tear down

```bash
cd infra && docker compose down -v
```

(The CloudFormation stack itself lives only inside that LocalStack
container, so removing the container removes everything it deployed.)

## Next step toward real AWS

Everything here maps 1:1 onto real AWS: remove `AWS_ENDPOINT_URL` from the
template, `sam deploy` (not `samlocal`) against a real AWS account, and swap
`localhost.localstack.cloud` for nothing (the AWS SDK's default endpoints
just work). The Lambda code, DynamoDB schema, and Step Functions definition
don't change.
