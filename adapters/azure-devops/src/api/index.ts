/**
 * Azure DevOps API Module
 *
 * This module exports the ADO client and related types for interacting
 * with Azure DevOps REST API.
 */

export {
  ADOClient,
  ADOApiError,
  ADOAuthenticationError,
  ADOAuthorizationError,
  ADONotFoundError,
  ADORateLimitError,
  ADOValidationError,
  ADOServerError,
  type PatchOperation,
} from './ado-client';
