# Mini CRM

A hackathon mini CRM with a conversational chat interface powered by Amazon Bedrock.

## Features

- Create and manage contacts
- Record interactions (calls, emails, meetings) with structured fields and free-text notes
- Chat-based interface — talk to an AI agent to create contacts and log interactions

## Stack

- **AI**: Amazon Bedrock (Claude via Converse API)
- **Storage**: AWS DynamoDB
- **Interface**: CLI chat

## Setup

```bash
pip install -r requirements.txt
```

Set environment variables:

```bash
export AWS_REGION=us-east-1
# AWS credentials via ~/.aws/credentials or IAM role
```

## Run

```bash
python main.py
```
