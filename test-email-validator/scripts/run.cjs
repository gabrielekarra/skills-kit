#!/usr/bin/env node

const fs = require('fs');

function validateEmail(email, checkDns) {
  const issues = [];
  let valid = true;
  let formatValid = true;
  let localPart = null;
  let domain = null;
  let hasMxRecord = undefined;

  // Check if email is empty
  if (!email || email.trim() === '') {
    issues.push('Email address is empty');
    formatValid = false;
    valid = false;
    return {
      valid,
      email,
      formatValid,
      issues
    };
  }

  // Count @ symbols
  const atCount = (email.match(/@/g) || []).length;
  
  if (atCount === 0) {
    issues.push('Missing @ symbol');
    formatValid = false;
    valid = false;
  } else if (atCount > 1) {
    issues.push('Multiple @ symbols');
    formatValid = false;
    valid = false;
  }

  // Split email into local and domain parts
  if (atCount === 1) {
    const parts = email.split('@');
    localPart = parts[0];
    domain = parts[1];

    // Validate local part
    if (!localPart || localPart.length === 0) {
      issues.push('Local part is empty');
      formatValid = false;
      valid = false;
    }

    // Validate domain
    if (!domain || domain.length === 0) {
      issues.push('Domain is empty');
      formatValid = false;
      valid = false;
    } else if (domain.indexOf('.') === -1) {
      issues.push('Domain missing top-level domain');
      formatValid = false;
      valid = false;
    }
  }

  // DNS check would require network access, which is disabled by policy
  // If checkDns is requested, we note this limitation
  if (checkDns) {
    // DNS lookup is not performed due to network policy restrictions
    hasMxRecord = undefined;
  }

  const result = {
    valid,
    email,
    formatValid,
    issues
  };

  if (localPart !== null) {
    result.localPart = localPart;
  }

  if (domain !== null) {
    result.domain = domain;
  }

  if (hasMxRecord !== undefined) {
    result.hasMxRecord = hasMxRecord;
  }

  return result;
}

function main() {
  let inputData = '';

  process.stdin.on('data', (chunk) => {
    inputData += chunk;
  });

  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(inputData);
      const email = input.email || '';
      const checkDns = input.checkDns || false;

      const result = validateEmail(email, checkDns);

      const output = {
        ok: true,
        result
      };

      console.log(JSON.stringify(output));
    } catch (err) {
      const output = {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message
        }
      };
      console.log(JSON.stringify(output));
    }
  });
}

main();
