import { describe, it, expect } from "vitest";
import {
  GMAIL_RESOURCE,
  GOOGLE_DOC_RESOURCE,
  GOOGLE_SHEETS_RESOURCE,
  GOOGLE_CALENDAR_RESOURCE,
  BIGQUERY_RESOURCE,
  GOOGLE_DRIVE_FOLDER_RESOURCE,
  IDENTITY_SCOPES,
  grantedResourcesFromScopes,
  resourceUrlPatternsToOAuthScopes,
  validateResourceUrlPatterns,
} from "../src/scopes";

// Canonical scope URIs kept in one place so typos in tests are caught by TypeScript.
const SCOPE = {
  documents:             "https://www.googleapis.com/auth/documents",
  spreadsheets:          "https://www.googleapis.com/auth/spreadsheets",
  spreadsheetsReadonly:  "https://www.googleapis.com/auth/spreadsheets.readonly",
  drive:                 "https://www.googleapis.com/auth/drive",
  driveFile:             "https://www.googleapis.com/auth/drive.file",
  driveMetadataReadonly: "https://www.googleapis.com/auth/drive.metadata.readonly",
  gmailLabels:           "https://www.googleapis.com/auth/gmail.labels",
  gmailModify:           "https://www.googleapis.com/auth/gmail.modify",
  calendarList:          "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  calendarEvents:        "https://www.googleapis.com/auth/calendar.events",
  bigquery:              "https://www.googleapis.com/auth/bigquery",
};

// ── Resource URL pattern ─────────────────────────────────────────────────

describe("GOOGLE_DRIVE_FOLDER_RESOURCE", () => {
  it("has the expected urlPattern for Drive folders", () => {
    expect(GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern).toBe(
      "https://drive.google.com/drive/folders/:folderId",
    );
  });

  it("has generic title and description (no Clara/workspace-setup wording)", () => {
    expect(GOOGLE_DRIVE_FOLDER_RESOURCE.title).toBe("Google Drive Folder");
    expect(GOOGLE_DRIVE_FOLDER_RESOURCE.description).not.toMatch(/Clara/i);
    expect(GOOGLE_DRIVE_FOLDER_RESOURCE.description).not.toMatch(/parent-email/i);
    expect(GOOGLE_DRIVE_FOLDER_RESOURCE.description).not.toMatch(/workspace setup/i);
  });
});

// ── grantedResourcesFromScopes ──────────────────────────────────────────────

describe("grantedResourcesFromScopes", () => {
  it("returns empty list for an empty grant", () => {
    expect(grantedResourcesFromScopes([])).toEqual([]);
  });

  it("recognises Drive Folder grant (drive+documents+spreadsheets) as satisfying Doc, Sheets, and Drive Folder", () => {
    // drive + documents + spreadsheets must unlock all three resources.
    const granted = grantedResourcesFromScopes([
      SCOPE.drive,
      SCOPE.documents,
      SCOPE.spreadsheets,
    ]);
    expect(granted).toContain(GOOGLE_DOC_RESOURCE.urlPattern);
    expect(granted).toContain(GOOGLE_SHEETS_RESOURCE.urlPattern);
    expect(granted).toContain(GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern);
  });

  it("does not add Gmail, Calendar, or BigQuery to a Drive Folder grant", () => {
    const granted = grantedResourcesFromScopes([
      SCOPE.drive,
      SCOPE.documents,
      SCOPE.spreadsheets,
    ]);
    expect(granted).not.toContain(GMAIL_RESOURCE.urlPattern);
    expect(granted).not.toContain(GOOGLE_CALENDAR_RESOURCE.urlPattern);
    expect(granted).not.toContain(BIGQUERY_RESOURCE.urlPattern);
  });

  it("does NOT recognise Drive Folder from the old drive.file scope (too narrow)", () => {
    // drive.file can only see app-created files; full drive scope is required.
    const granted = grantedResourcesFromScopes([
      SCOPE.driveFile,
      SCOPE.documents,
      SCOPE.spreadsheets,
    ]);
    expect(granted).not.toContain(GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern);
    // drive.file is not a Drive Folder core scope, but documents + spreadsheets still satisfy
    // their respective resources.
    expect(granted).toContain(GOOGLE_DOC_RESOURCE.urlPattern);
    expect(granted).toContain(GOOGLE_SHEETS_RESOURCE.urlPattern);
  });

  it("recognises Google Doc from the documents scope alone (drive.metadata.readonly is supplemental)", () => {
    const granted = grantedResourcesFromScopes([SCOPE.documents]);
    expect(granted).toContain(GOOGLE_DOC_RESOURCE.urlPattern);
    expect(granted).not.toContain(GOOGLE_SHEETS_RESOURCE.urlPattern);
    expect(granted).not.toContain(GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern);
  });

  it("recognises Google Doc when drive.metadata.readonly is also present", () => {
    const granted = grantedResourcesFromScopes([SCOPE.documents, SCOPE.driveMetadataReadonly]);
    expect(granted).toContain(GOOGLE_DOC_RESOURCE.urlPattern);
    // drive.metadata.readonly alone does not satisfy Sheets or Drive Folder
    expect(granted).not.toContain(GOOGLE_SHEETS_RESOURCE.urlPattern);
    expect(granted).not.toContain(GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern);
  });

  it("recognises Google Sheets from the full spreadsheets scope", () => {
    const granted = grantedResourcesFromScopes([SCOPE.spreadsheets]);
    expect(granted).toContain(GOOGLE_SHEETS_RESOURCE.urlPattern);
    expect(granted).not.toContain(GOOGLE_DOC_RESOURCE.urlPattern);
    expect(granted).not.toContain(GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern);
  });

  it("does NOT recognise Sheets from the legacy spreadsheets.readonly scope", () => {
    // The resource now requires full write access; a readonly-only grant must prompt expansion.
    const granted = grantedResourcesFromScopes([
      SCOPE.spreadsheetsReadonly,
      SCOPE.driveMetadataReadonly,
    ]);
    expect(granted).not.toContain(GOOGLE_SHEETS_RESOURCE.urlPattern);
  });

  it("requires ALL three Drive Folder core scopes — any two of three is insufficient", () => {
    expect(grantedResourcesFromScopes([SCOPE.drive, SCOPE.documents]))
      .not.toContain(GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern);
    expect(grantedResourcesFromScopes([SCOPE.drive, SCOPE.spreadsheets]))
      .not.toContain(GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern);
    expect(grantedResourcesFromScopes([SCOPE.documents, SCOPE.spreadsheets]))
      .not.toContain(GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern);
  });

  it("recognises Gmail from its two core scopes", () => {
    const granted = grantedResourcesFromScopes([SCOPE.gmailLabels, SCOPE.gmailModify]);
    expect(granted).toContain(GMAIL_RESOURCE.urlPattern);
    expect(granted).not.toContain(GOOGLE_DOC_RESOURCE.urlPattern);
  });

  it("recognises Calendar from its two core scopes", () => {
    const granted = grantedResourcesFromScopes([SCOPE.calendarList, SCOPE.calendarEvents]);
    expect(granted).toContain(GOOGLE_CALENDAR_RESOURCE.urlPattern);
  });

  it("recognises BigQuery from its core scope", () => {
    const granted = grantedResourcesFromScopes([SCOPE.bigquery]);
    expect(granted).toContain(BIGQUERY_RESOURCE.urlPattern);
  });

  it("recognises all resources when all scopes are granted", () => {
    const granted = grantedResourcesFromScopes([
      SCOPE.gmailLabels, SCOPE.gmailModify,
      SCOPE.documents,
      SCOPE.spreadsheets,
      SCOPE.drive,
      SCOPE.calendarList, SCOPE.calendarEvents,
      SCOPE.bigquery,
      SCOPE.driveMetadataReadonly,
    ]);
    expect(granted).toContain(GMAIL_RESOURCE.urlPattern);
    expect(granted).toContain(GOOGLE_DOC_RESOURCE.urlPattern);
    expect(granted).toContain(GOOGLE_SHEETS_RESOURCE.urlPattern);
    expect(granted).toContain(GOOGLE_CALENDAR_RESOURCE.urlPattern);
    expect(granted).toContain(BIGQUERY_RESOURCE.urlPattern);
    expect(granted).toContain(GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern);
  });
});

// ── resourceUrlPatternsToOAuthScopes ───────────────────────────────────────

describe("resourceUrlPatternsToOAuthScopes", () => {
  it("always includes identity scopes even with an empty pattern list", () => {
    const scopes = resourceUrlPatternsToOAuthScopes([]);
    for (const id of IDENTITY_SCOPES) {
      expect(scopes).toContain(id);
    }
  });

  it("includes documents core scope and drive.metadata.readonly supplemental for Doc", () => {
    const scopes = resourceUrlPatternsToOAuthScopes([GOOGLE_DOC_RESOURCE.urlPattern]);
    expect(scopes).toContain(SCOPE.documents);
    expect(scopes).toContain(SCOPE.driveMetadataReadonly);
    // No unrelated scopes
    expect(scopes).not.toContain(SCOPE.drive);
    expect(scopes).not.toContain(SCOPE.driveFile);
    expect(scopes).not.toContain(SCOPE.spreadsheets);
  });

  it("includes full spreadsheets scope and drive.metadata.readonly supplemental for Sheets", () => {
    const scopes = resourceUrlPatternsToOAuthScopes([GOOGLE_SHEETS_RESOURCE.urlPattern]);
    expect(scopes).toContain(SCOPE.spreadsheets);
    expect(scopes).toContain(SCOPE.driveMetadataReadonly);
    // Does NOT request the old readonly scope or drive
    expect(scopes).not.toContain(SCOPE.spreadsheetsReadonly);
    expect(scopes).not.toContain(SCOPE.drive);
    expect(scopes).not.toContain(SCOPE.driveFile);
  });

  it("includes drive + documents + spreadsheets for Google Drive Folder", () => {
    const scopes = resourceUrlPatternsToOAuthScopes([GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern]);
    expect(scopes).toContain(SCOPE.drive);
    expect(scopes).toContain(SCOPE.documents);
    expect(scopes).toContain(SCOPE.spreadsheets);
    // Drive Folder has no supplemental scopes — drive.metadata.readonly not needed
    expect(scopes).not.toContain(SCOPE.driveMetadataReadonly);
    // Should not include the old narrow scope
    expect(scopes).not.toContain(SCOPE.driveFile);
  });

  it("deduplicates scopes shared across resources", () => {
    // documents appears in Google Doc and Drive Folder; spreadsheets in Sheets and Drive Folder.
    const scopes = resourceUrlPatternsToOAuthScopes([
      GOOGLE_DOC_RESOURCE.urlPattern,
      GOOGLE_SHEETS_RESOURCE.urlPattern,
      GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern,
    ]);
    expect(scopes.filter(s => s === SCOPE.documents)).toHaveLength(1);
    expect(scopes.filter(s => s === SCOPE.spreadsheets)).toHaveLength(1);
    // drive.metadata.readonly comes from Doc and Sheets supplemental — still just one copy.
    expect(scopes.filter(s => s === SCOPE.driveMetadataReadonly)).toHaveLength(1);
  });

  it("includes all scopes when called with no argument (all resources)", () => {
    const scopes = resourceUrlPatternsToOAuthScopes();
    expect(scopes).toContain(SCOPE.documents);
    expect(scopes).toContain(SCOPE.spreadsheets);
    expect(scopes).toContain(SCOPE.drive);
    expect(scopes).toContain(SCOPE.driveMetadataReadonly);
    expect(scopes).toContain(SCOPE.bigquery);
    expect(scopes).toContain(SCOPE.gmailLabels);
    expect(scopes).toContain(SCOPE.gmailModify);
    // drive.file is no longer requested; only broad drive scope
    expect(scopes).not.toContain(SCOPE.driveFile);
  });

  it("rejects unknown resource patterns", () => {
    expect(() => resourceUrlPatternsToOAuthScopes(["https://example.com/*"]))
      .toThrow("Unknown grantable resource URL pattern(s)");
  });
});

// ── validateResourceUrlPatterns ────────────────────────────────────────────

describe("validateResourceUrlPatterns", () => {
  it("accepts undefined (no-op)", () => {
    expect(() => validateResourceUrlPatterns(undefined)).not.toThrow();
  });

  it("accepts an empty array", () => {
    expect(() => validateResourceUrlPatterns([])).not.toThrow();
  });

  it("accepts all known patterns including the new Drive Folder pattern", () => {
    expect(() => validateResourceUrlPatterns([
      GMAIL_RESOURCE.urlPattern,
      GOOGLE_DOC_RESOURCE.urlPattern,
      GOOGLE_SHEETS_RESOURCE.urlPattern,
      GOOGLE_CALENDAR_RESOURCE.urlPattern,
      BIGQUERY_RESOURCE.urlPattern,
      GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern,
    ])).not.toThrow();
  });

  it("rejects the old my-drive pattern (no longer a supported resource URL pattern)", () => {
    expect(() => validateResourceUrlPatterns(["https://drive.google.com/drive/my-drive"]))
      .toThrow("Unknown grantable resource URL pattern(s)");
  });

  it("rejects an unknown pattern", () => {
    expect(() => validateResourceUrlPatterns(["https://unknown.example.com/*"]))
      .toThrow("Unknown grantable resource URL pattern(s)");
  });
});

// ── ensureResources scenario ────────────────────────────────────────────────

describe("ensureResources scenario", () => {
  it("does not prompt re-auth when Drive Folder grant (drive+docs+sheets) already covers Doc and Sheets", () => {
    // Mirrors the logic in GatekeeperUserImpl.ensureResources:
    //   if (resourceUrlPatterns.every(pattern => granted.has(pattern))) return {};
    const grantedScopes = [SCOPE.drive, SCOPE.documents, SCOPE.spreadsheets];
    const grantedPatterns = new Set(grantedResourcesFromScopes(grantedScopes));

    expect(grantedPatterns.has(GOOGLE_DOC_RESOURCE.urlPattern)).toBe(true);
    expect(grantedPatterns.has(GOOGLE_SHEETS_RESOURCE.urlPattern)).toBe(true);
    expect(grantedPatterns.has(GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern)).toBe(true);
  });

  it("does NOT recognise Drive Folder from old drive.file grant (must reconnect with drive scope)", () => {
    const grantedScopes = [SCOPE.driveFile, SCOPE.documents, SCOPE.spreadsheets];
    const grantedPatterns = new Set(grantedResourcesFromScopes(grantedScopes));

    // Doc and Sheets still satisfied (their core scopes are unchanged)
    expect(grantedPatterns.has(GOOGLE_DOC_RESOURCE.urlPattern)).toBe(true);
    expect(grantedPatterns.has(GOOGLE_SHEETS_RESOURCE.urlPattern)).toBe(true);
    // But Drive Folder is NOT satisfied — requires full drive scope now
    expect(grantedPatterns.has(GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern)).toBe(false);
  });

  it("prompts re-auth when only Doc is granted and Sheets is newly needed", () => {
    const grantedScopes = [SCOPE.documents, SCOPE.driveMetadataReadonly];
    const grantedPatterns = new Set(grantedResourcesFromScopes(grantedScopes));

    // Doc is satisfied but Sheets is not — ensureResources should return a URL.
    expect(grantedPatterns.has(GOOGLE_DOC_RESOURCE.urlPattern)).toBe(true);
    expect(grantedPatterns.has(GOOGLE_SHEETS_RESOURCE.urlPattern)).toBe(false);
  });

  it("the expansion scope union for Doc+Sheets adds spreadsheets but not drive or drive.file", () => {
    // Simulates ensureResources expanding from Doc-only to Doc+Sheets.
    const existingGrantedPatterns = [GOOGLE_DOC_RESOURCE.urlPattern];
    const newlyNeeded = [GOOGLE_SHEETS_RESOURCE.urlPattern];
    const unionPatterns = [...new Set([...existingGrantedPatterns, ...newlyNeeded])];

    const expansionScopes = resourceUrlPatternsToOAuthScopes(unionPatterns);
    expect(expansionScopes).toContain(SCOPE.documents);
    expect(expansionScopes).toContain(SCOPE.spreadsheets);
    // drive is only needed for Drive Folder, not Doc/Sheets
    expect(expansionScopes).not.toContain(SCOPE.drive);
    expect(expansionScopes).not.toContain(SCOPE.driveFile);
  });

  it("expansion to add Drive Folder from Doc+Sheets includes drive scope", () => {
    const existingGrantedPatterns = [
      GOOGLE_DOC_RESOURCE.urlPattern,
      GOOGLE_SHEETS_RESOURCE.urlPattern,
    ];
    const newlyNeeded = [GOOGLE_DRIVE_FOLDER_RESOURCE.urlPattern];
    const unionPatterns = [...new Set([...existingGrantedPatterns, ...newlyNeeded])];

    const expansionScopes = resourceUrlPatternsToOAuthScopes(unionPatterns);
    expect(expansionScopes).toContain(SCOPE.drive);
    expect(expansionScopes).toContain(SCOPE.documents);
    expect(expansionScopes).toContain(SCOPE.spreadsheets);
    // drive.file should not appear — only broad drive scope is used now
    expect(expansionScopes).not.toContain(SCOPE.driveFile);
  });
});
