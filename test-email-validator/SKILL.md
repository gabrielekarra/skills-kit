---
name: email-validator
description: Validates email addresses and returns detailed validation information including format validation, domain checks, and structure analysis
version: 0.1.0
authors:
  - AI Assistant
allowed_tools: []
entrypoints:
  - scripts/run.cjs
inputs:
  type: object
  required:
    - email
  properties:
    email:
      type: string
      description: The email address to validate
    checkDns:
      type: boolean
      description: Whether to perform DNS MX record lookup
      default: false
outputs:
  type: object
  required:
    - ok
  properties:
    ok:
      type: boolean
      description: Whether the operation succeeded
    result:
      type: object
      properties:
        valid:
          type: boolean
          description: Whether the email address is valid
        email:
          type: string
          description: The original email address
        localPart:
          type: string
          description: The local part of the email (before @)
        domain:
          type: string
          description: The domain part of the email (after @)
        formatValid:
          type: boolean
          description: Whether the email format is valid
        hasMxRecord:
          type: boolean
          description: Whether the domain has MX records (if checkDns is enabled)
        issues:
          type: array
          items:
            type: string
          description: List of validation issues found
    error:
      type: object
      properties:
        code:
          type: string
        message:
          type: string
capabilities:
  - email-validation
  - format-checking
  - dns-lookup
---

# Email Validator

Validates email addresses and returns detailed validation information including format validation, domain checks, and structure analysis.

## Features

- Email format validation
- Domain and local part extraction
- Optional DNS MX record checking
- Detailed issue reporting

## Usage

Provide an email address to validate:

```json
{
  "email": "user@example.com",
  "checkDns": false
}
```

The skill returns validation results with detailed information about the email structure and any issues found.
