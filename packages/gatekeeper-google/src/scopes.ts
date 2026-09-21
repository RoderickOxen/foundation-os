import type { SupportedResource } from "@gadgets/workshop-shared/gatekeeper";

// OAuth scopes we always request, used to identify the account (name, email, avatar). Not tied to
// any resource type.
export const IDENTITY_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
];

// Minimal scopes for sign-in only (verify the user's email). Used when connecting in "auth" mode;
// the resulting grant is transient. (Same as IDENTITY_SCOPES — sign-in needs no resource scopes.)
export const AUTH_SCOPES = IDENTITY_SCOPES;

export const BIGQUERY_HOST = "bigquery.googleapis.com";

export const GMAIL_RESOURCE: SupportedResource = {
  urlPattern: "https://mail.google.com/*",
  title: "Gmail Mailbox",
  description: "Read emails and apply labels.",
  grantable: true,
};

export const GOOGLE_DOC_RESOURCE: SupportedResource = {
  urlPattern: "https://docs.google.com/document/d/:docId/*",
  title: "Google Doc",
  description: "Read and edit documents you choose.",
  grantable: true,
};

export const GOOGLE_SHEETS_RESOURCE: SupportedResource = {
  urlPattern: "https://docs.google.com/spreadsheets/d/:spreadsheetId/*",
  title: "Google Spreadsheet",
  description: "Read and write values in a spreadsheet you choose.",
  grantable: true,
};

export const GOOGLE_CALENDAR_RESOURCE: SupportedResource = {
  urlPattern: "https://calendar.google.com/calendar/:calendarId/*",
  title: "Google Calendar",
  description: "Read and manage a Google Calendar.",
  grantable: true,
};

export const BIGQUERY_RESOURCE: SupportedResource = {
  urlPattern: `https://${BIGQUERY_HOST}/:projectId/*`,
  title: "BigQuery",
  description: "Choose a Google Cloud project, then optionally narrow access to a dataset or table.",
  grantable: true,
};

// Google Drive Folder: list/read/write files and create folders, Docs, and Sheets inside a
// connected Drive folder. Uses broad Drive scope (https://www.googleapis.com/auth/drive) so the
// agent can query any folder the user connected, including pre-existing ones not created by this
// app. drive.file would only see app-created files, which is too narrow for arbitrary folder reads.
//
// NOTE: https://www.googleapis.com/auth/drive is a "restricted" Google OAuth scope that requires
// Google's OAuth verification review before use by a production public app.
//
// urlPattern uses the standard folders/:folderId path. The special "root" folder ID refers to
// My Drive. Legacy "my-drive" URLs are still routed by getGatekeeperClassFor for backward
// compatibility with accounts connected before this pattern was introduced.
export const GOOGLE_DRIVE_FOLDER_RESOURCE: SupportedResource = {
  urlPattern: "https://drive.google.com/drive/folders/:folderId",
  title: "Google Drive Folder",
  description:
    "List files and create folders, Google Docs, and Google Sheets inside a connected Drive " +
    "folder. Use the root folder ID (\"root\") for My Drive.",
  grantable: true,
};

// Accounts connected before per-resource scope tracking received scopes for exactly these
// resources.
export const LEGACY_GRANTED_RESOURCE_URL_PATTERNS = [
  GMAIL_RESOURCE.urlPattern,
  GOOGLE_DOC_RESOURCE.urlPattern,
  BIGQUERY_RESOURCE.urlPattern,
];

/**
 * Per-resource OAuth scope definition.
 *
 * `coreScopes` — the minimal set of OAuth scopes that represent the resource's core API
 *   capability. ALL must be present in a grant for `grantedResourcesFromScopes` to consider
 *   the resource satisfied. These are the scopes that enable the actual API operations
 *   (reading/writing Docs content, reading/writing Sheets data, etc.).
 *
 * `supplementalScopes` — additional scopes requested during OAuth to improve the user
 *   experience (e.g. drive.metadata.readonly for the file picker in the configurator UI),
 *   but NOT required for the core API operations. Intentionally excluded from the
 *   `grantedResourcesFromScopes` check so that a grant covering the same core scopes via a
 *   different path — for example, the drive.file + documents + spreadsheets combination
 *   granted by Drive Workspace Setup — is correctly recognised as also satisfying the Google
 *   Doc and Google Spreadsheet resources.
 */
type ResourceScopeEntry = {
  resource: SupportedResource;
  /** Required for capability recognition. ALL must be present in `grantedResourcesFromScopes`. */
  coreScopes: string[];
  /** Optional UX helpers. Included in OAuth requests but NOT checked by `grantedResourcesFromScopes`. */
  supplementalScopes?: string[];
};

export const RESOURCE_SCOPES: ResourceScopeEntry[] = [
  {
    resource: GMAIL_RESOURCE,
    coreScopes: [
      "https://www.googleapis.com/auth/gmail.labels",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
  },
  {
    resource: GOOGLE_DOC_RESOURCE,
    coreScopes: [
      // Read and write Google Docs content.
      "https://www.googleapis.com/auth/documents",
    ],
    supplementalScopes: [
      // Read-only Drive file metadata — powers the doc picker in the configurator UI.
      // Not required for actual Docs API reads/writes; absent from grantedResourcesFromScopes
      // so a Drive Workspace Setup grant (drive.file + documents + spreadsheets) is still
      // recognised as satisfying this resource.
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
  },
  {
    resource: GOOGLE_SHEETS_RESOURCE,
    coreScopes: [
      // Full read/write access to Google Sheets. Replaces the former spreadsheets.readonly
      // scope so that agents can write as well as read, and so that the spreadsheets scope
      // included in Drive Workspace Setup grants (drive.file + documents + spreadsheets)
      // is correctly recognised as satisfying this resource.
      "https://www.googleapis.com/auth/spreadsheets",
    ],
    supplementalScopes: [
      // Read-only Drive file metadata — powers the spreadsheet picker in the configurator UI.
      // Not required for actual Sheets API reads/writes; absent from grantedResourcesFromScopes
      // so a Drive Workspace Setup grant is still recognised as satisfying this resource.
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
  },
  {
    resource: GOOGLE_CALENDAR_RESOURCE,
    coreScopes: [
      // Read-only calendar list, used to power the calendar picker when connecting a calendar.
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  },
  {
    resource: BIGQUERY_RESOURCE,
    coreScopes: [
      // `bigquery` (not `bigquery.readonly`): dry-runs go through `jobs.insert` for scope
      // enforcement, which `readonly` doesn't permit. Read-only is enforced at the API layer.
      "https://www.googleapis.com/auth/bigquery",
    ],
  },
  {
    resource: GOOGLE_DRIVE_FOLDER_RESOURCE,
    coreScopes: [
      // Full Drive read/write: list arbitrary folders/files, download, and create/write.
      // drive.file only sees app-created files (too narrow for querying arbitrary folders);
      // drive.readonly would not allow creating folders, Docs, or Sheets.
      "https://www.googleapis.com/auth/drive",
      // Write initial content to Google Docs created in Drive (Docs API).
      // Also satisfies the Google Doc resource (documents is its sole coreScope).
      "https://www.googleapis.com/auth/documents",
      // Read and write Google Sheets in Drive (Sheets API).
      // Also satisfies the Google Spreadsheet resource.
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  },
];

export const SUPPORTED_RESOURCES: SupportedResource[] = RESOURCE_SCOPES.map(entry => entry.resource);

export function validateResourceUrlPatterns(resourceUrlPatterns?: string[]): void {
  if (resourceUrlPatterns === undefined) return;

  let knownPatterns = new Set(RESOURCE_SCOPES.map(entry => entry.resource.urlPattern));
  let unknownPatterns = resourceUrlPatterns.filter(pattern => !knownPatterns.has(pattern));
  if (unknownPatterns.length > 0) {
    throw new Error(`Unknown grantable resource URL pattern(s): ${unknownPatterns.join(", ")}`);
  }
}

/**
 * The OAuth scopes to request for the given grantable resource `urlPattern`s.
 *
 * Includes both `coreScopes` (required for the resource's API capability) and
 * `supplementalScopes` (e.g. drive.metadata.readonly for the file picker), so new connections
 * receive the full experience. Supplemental scopes are excluded from `grantedResourcesFromScopes`
 * checks, so a pre-existing grant that already covers the core scopes via a different path
 * (e.g. Drive Workspace Setup) is still recognised as satisfying the resource.
 */
export function resourceUrlPatternsToOAuthScopes(resourceUrlPatterns?: string[]): string[] {
  validateResourceUrlPatterns(resourceUrlPatterns);

  let scopes = new Set<string>(IDENTITY_SCOPES);
  for (let entry of RESOURCE_SCOPES) {
    if (resourceUrlPatterns === undefined ||
        resourceUrlPatterns.includes(entry.resource.urlPattern)) {
      for (let scope of entry.coreScopes) scopes.add(scope);
      for (let scope of (entry.supplementalScopes ?? [])) scopes.add(scope);
    }
  }
  return [...scopes];
}

/**
 * The grantable resource URL patterns that a given set of OAuth scopes satisfies.
 *
 * A resource is satisfied when ALL of its `coreScopes` are present in the grant.
 * `supplementalScopes` (e.g. drive.metadata.readonly for the file picker) are intentionally
 * excluded from this check so that a Drive Workspace Setup grant of drive.file + documents +
 * spreadsheets is correctly recognised as also satisfying the Google Doc and Google Spreadsheet
 * resources — without requiring the user to perform an additional OAuth round trip.
 */
export function grantedResourcesFromScopes(grantedOAuthScopes: string[]): string[] {
  let granted = new Set(grantedOAuthScopes);
  return RESOURCE_SCOPES
      .filter(entry => entry.coreScopes.every(scope => granted.has(scope)))
      .map(entry => entry.resource.urlPattern);
}
