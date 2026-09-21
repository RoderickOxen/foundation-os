// Drive API: helpers to list, query, and create files/folders in a connected Google Drive folder.
//
// Scope requirements:
//   drive        – full read/write access; required to list arbitrary (non-app-created) folders.
//   documents    – write content to Google Docs via the Docs API.
//   spreadsheets – read and write Google Sheets via the Sheets API.
//
// Idempotency (createX methods): every create helper searches for an existing file by name (and
// optional parent/mimeType) before creating, so repeat calls don't accumulate duplicates.

import { AccessTokenProvider, fetchWithAuthRetry } from "./auth-retry";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DOCS_API_BASE = "https://docs.googleapis.com/v1";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DOC_MIME = "application/vnd.google-apps.document";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

const MAX_LIST_PAGE_SIZE = 1000;
const DEFAULT_LIST_PAGE_SIZE = 200;

export type DriveFileRef = {
  id: string;
  name: string;
};

/**
 * Metadata returned by getFileMeta(). Includes trashed status and immediate parents,
 * used to populate approval descriptions and to determine old parents when moving a file.
 */
export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  /** Whether the file is currently in the trash. */
  trashed: boolean;
  /** Immediate parent folder IDs. Typically one entry; Drive supports multi-parent as a legacy feature. */
  parents?: string[];
};

/** A file or folder entry returned by listFiles(). */
export type DriveFileEntry = {
  id: string;
  name: string;
  /** MIME type, e.g. "application/vnd.google-apps.folder", "application/vnd.google-apps.document". */
  mimeType: string;
  /** Web URL to open the file in a browser (Google Workspace items have a webViewLink). */
  url?: string;
  modifiedTime?: string;
  /** Size in bytes as a string (absent for Google Workspace files like Docs/Sheets). */
  size?: string;
};

/** Metadata returned by getFolder(). */
export type DriveFolderInfo = {
  id: string;
  name: string;
  /** Web URL to open the folder in a browser. */
  url: string;
};

async function readErrorText(response: Response): Promise<string> {
  try { return await response.text(); } catch { return response.statusText; }
}

export class DriveSetupApi {
  constructor(private readonly getToken: AccessTokenProvider) {}

  // ── Listing / metadata ───────────────────────────────────────────────────

  /**
   * List all non-trashed files and folders directly inside `folderId`.
   * Pass `"root"` (or undefined) to list the user's My Drive root.
   * Requires the `drive` scope to see files not created by this app.
   */
  async listFiles(folderId?: string): Promise<DriveFileEntry[]> {
    const parent = folderId ?? "root";
    const q = `'${parent}' in parents and trashed = false`;
    const url = new URL(`${DRIVE_API_BASE}/files`);
    url.searchParams.set("q", q);
    url.searchParams.set("fields", "files(id,name,mimeType,webViewLink,modifiedTime,size)");
    url.searchParams.set("pageSize", "200");
    url.searchParams.set("orderBy", "folder,name");

    const response = await fetchWithAuthRetry(url.toString(), {}, this.getToken);
    if (!response.ok) {
      const text = await readErrorText(response);
      throw new Error(`Drive file list failed: ${response.status} ${text}`);
    }
    const body = await response.json<{
      files?: Array<{
        id: string; name: string; mimeType: string;
        webViewLink?: string; modifiedTime?: string; size?: string;
      }>;
    }>();
    return (body.files ?? []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      ...(f.webViewLink ? { url: f.webViewLink } : {}),
      ...(f.modifiedTime ? { modifiedTime: f.modifiedTime } : {}),
      ...(f.size ? { size: f.size } : {}),
    }));
  }

  /**
   * List files and folders directly inside `folderId` with optional filters.
   * Pass `"root"` for My Drive root. Applies the `drive` scope to see all files.
   *
   * @param folderId        Folder to list — `"root"` or a real Drive folder ID.
   * @param opts.name       Optional exact-name filter.
   * @param opts.mimeType   Optional MIME type filter.
   * @param opts.includeTrashed  Include trashed files (default false).
   * @param opts.pageSize   Max results, 1–1000 (default 200).
   */
  async listFilesInFolder(
    folderId: string,
    opts: {
      name?: string;
      mimeType?: string;
      includeTrashed?: boolean;
      pageSize?: number;
    } = {},
  ): Promise<DriveFileEntry[]> {
    const { name, mimeType, includeTrashed = false, pageSize = DEFAULT_LIST_PAGE_SIZE } = opts;
    const clampedPageSize = Math.min(MAX_LIST_PAGE_SIZE, Math.max(1, pageSize));

    // Drive query: single-quote literal values and escape embedded quotes/backslashes.
    let q = `'${folderId}' in parents`;
    if (!includeTrashed) q += " and trashed = false";
    if (name !== undefined) {
      const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      q += ` and name = '${escaped}'`;
    }
    if (mimeType !== undefined) {
      q += ` and mimeType = '${mimeType}'`;
    }

    const url = new URL(`${DRIVE_API_BASE}/files`);
    url.searchParams.set("q", q);
    url.searchParams.set("fields", "files(id,name,mimeType,webViewLink,modifiedTime,size)");
    url.searchParams.set("pageSize", String(clampedPageSize));
    url.searchParams.set("orderBy", "folder,name");

    const response = await fetchWithAuthRetry(url.toString(), {}, this.getToken);
    if (!response.ok) {
      const text = await readErrorText(response);
      throw new Error(`Drive file list failed: ${response.status} ${text}`);
    }
    const body = await response.json<{
      files?: Array<{
        id: string; name: string; mimeType: string;
        webViewLink?: string; modifiedTime?: string; size?: string;
      }>;
    }>();
    return (body.files ?? []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      ...(f.webViewLink ? { url: f.webViewLink } : {}),
      ...(f.modifiedTime ? { modifiedTime: f.modifiedTime } : {}),
      ...(f.size ? { size: f.size } : {}),
    }));
  }

  /**
   * Get the name and URL of a Drive folder by its ID.
   * Pass `"root"` to get My Drive metadata.
   * Requires the `drive` scope.
   */
  async getFolder(folderId: string): Promise<DriveFolderInfo> {
    const response = await fetchWithAuthRetry(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(folderId)}?fields=id,name,webViewLink`,
      {},
      this.getToken,
    );
    if (!response.ok) {
      const text = await readErrorText(response);
      throw new Error(`Drive folder metadata fetch failed: ${response.status} ${text}`);
    }
    const data = await response.json<{ id: string; name: string; webViewLink?: string }>();
    return {
      id: data.id,
      name: data.name,
      url: data.webViewLink ??
        (data.id === "root"
          ? "https://drive.google.com/drive/my-drive"
          : `https://drive.google.com/drive/folders/${data.id}`),
    };
  }

  // ── Discovery ────────────────────────────────────────────────────────────

  /**
   * Resolve a sequence of folder-name segments to a folder ID, starting from `rootId`.
   * Uses `findByName` at each step — **read-only**, never creates folders.
   * Returns the resolved folder ID string, or `null` if any segment along the path
   * does not exist.
   *
   * Pass `"root"` for `rootId` to start from My Drive root; pass a real folder ID to
   * start from a specific bound folder. An empty `segments` array returns `rootId`
   * immediately (the starting folder itself).
   */
  async findFolderByPath(
    segments: string[],
    rootId: string,
  ): Promise<string | null> {
    let currentId: string = rootId;
    for (const segment of segments) {
      const found = await this.findByName(segment, currentId, FOLDER_MIME);
      if (!found) return null;
      currentId = found.id;
    }
    return currentId;
  }

  /**
   * Find a file by name within an optional parent and of an optional MIME type.
   * With the `drive` scope this sees all files (not just app-created ones).
   * Returns the first match or null when none exists.
   */
  async findByName(
    name: string,
    parentId?: string,
    mimeType?: string,
  ): Promise<DriveFileRef | null> {
    // Drive query strings single-quote literals; escape \' per Google's docs.
    const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    let q = `name = '${escaped}' and trashed = false`;
    if (parentId) q += ` and '${parentId}' in parents`;
    if (mimeType) q += ` and mimeType = '${mimeType}'`;

    const url = new URL(`${DRIVE_API_BASE}/files`);
    url.searchParams.set("q", q);
    url.searchParams.set("fields", "files(id,name)");
    url.searchParams.set("pageSize", "1");

    const response = await fetchWithAuthRetry(url.toString(), {}, this.getToken);
    if (!response.ok) {
      const text = await readErrorText(response);
      throw new Error(`Drive file search failed: ${response.status} ${text}`);
    }
    const body = await response.json<{ files?: { id: string; name: string }[] }>();
    return body.files?.[0] ?? null;
  }

  // ── Folder ───────────────────────────────────────────────────────────────

  /**
   * Create a Drive folder inside an optional parent.
   * Does NOT check for duplicates — use findOrCreateFolder for idempotency.
   */
  async createFolder(name: string, parentId?: string): Promise<DriveFileRef> {
    const meta: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
    if (parentId) meta.parents = [parentId];

    const response = await fetchWithAuthRetry(
      `${DRIVE_API_BASE}/files`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta) },
      this.getToken,
    );
    if (!response.ok) {
      const text = await readErrorText(response);
      throw new Error(`Failed to create Drive folder "${name}": ${response.status} ${text}`);
    }
    return response.json<DriveFileRef>();
  }

  /** Find or create a Drive folder (idempotent). */
  async findOrCreateFolder(
    name: string,
    parentId?: string,
  ): Promise<{ file: DriveFileRef; created: boolean }> {
    const existing = await this.findByName(name, parentId, FOLDER_MIME);
    if (existing) return { file: existing, created: false };
    const file = await this.createFolder(name, parentId);
    return { file, created: true };
  }

  // ── Google Doc ───────────────────────────────────────────────────────────

  /**
   * Find or create a Google Doc, optionally inserting `initialText` on creation.
   *
   * Creation uses two API calls:
   *   1. Drive files.create (drive.file scope) — creates the empty doc in the given parent.
   *   2. Docs documents.batchUpdate (documents scope) — inserts the initial text.
   *
   * Requires drive.file and documents scopes.
   */
  async findOrCreateDoc(
    name: string,
    parentId?: string,
    initialText?: string,
  ): Promise<{ file: DriveFileRef; created: boolean }> {
    const existing = await this.findByName(name, parentId, DOC_MIME);
    if (existing) return { file: existing, created: false };

    // Create via Drive API so we can set the parent folder.
    const meta: Record<string, unknown> = { name, mimeType: DOC_MIME };
    if (parentId) meta.parents = [parentId];

    const createResp = await fetchWithAuthRetry(
      `${DRIVE_API_BASE}/files`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta) },
      this.getToken,
    );
    if (!createResp.ok) {
      const text = await readErrorText(createResp);
      throw new Error(`Failed to create Google Doc "${name}": ${createResp.status} ${text}`);
    }
    const file = await createResp.json<DriveFileRef>();

    // Insert initial text via Docs API. A fresh blank Google Doc has one paragraph at index 1.
    if (initialText) {
      const contentResp = await fetchWithAuthRetry(
        `${DOCS_API_BASE}/documents/${encodeURIComponent(file.id)}:batchUpdate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [{ insertText: { location: { index: 1 }, text: initialText } }],
          }),
        },
        this.getToken,
      );
      if (!contentResp.ok) {
        const text = await readErrorText(contentResp);
        throw new Error(
          `Failed to write initial content to Google Doc "${name}": ${contentResp.status} ${text}`);
      }
      await contentResp.body?.cancel();
    }

    return { file, created: true };
  }

  // ── Google Sheet ─────────────────────────────────────────────────────────

  /**
   * Find or create a Google Spreadsheet, optionally appending `initialRows` on creation.
   *
   * Creation uses two API calls:
   *   1. Drive files.create (drive.file scope) — creates the empty spreadsheet in the given parent.
   *   2. Sheets spreadsheets.values.append (spreadsheets scope) — writes the initial rows.
   *
   * Requires drive.file and spreadsheets scopes.
   */
  async findOrCreateSheet(
    name: string,
    parentId?: string,
    initialRows?: string[][],
  ): Promise<{ file: DriveFileRef; created: boolean }> {
    const existing = await this.findByName(name, parentId, SHEET_MIME);
    if (existing) return { file: existing, created: false };

    // Create via Drive API so we can set the parent folder.
    const meta: Record<string, unknown> = { name, mimeType: SHEET_MIME };
    if (parentId) meta.parents = [parentId];

    const createResp = await fetchWithAuthRetry(
      `${DRIVE_API_BASE}/files`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta) },
      this.getToken,
    );
    if (!createResp.ok) {
      const text = await readErrorText(createResp);
      throw new Error(
        `Failed to create Google Spreadsheet "${name}": ${createResp.status} ${text}`);
    }
    const file = await createResp.json<DriveFileRef>();

    // Append initial rows via Sheets API.
    if (initialRows && initialRows.length > 0) {
      const rowsResp = await fetchWithAuthRetry(
        // valueInputOption=RAW: treats values as plain strings, not formulas.
        `${SHEETS_API_BASE}/spreadsheets/${encodeURIComponent(file.id)}/values/A1:append?valueInputOption=RAW`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: initialRows }),
        },
        this.getToken,
      );
      if (!rowsResp.ok) {
        const text = await readErrorText(rowsResp);
        throw new Error(
          `Failed to write initial rows to spreadsheet "${name}": ${rowsResp.status} ${text}`);
      }
      await rowsResp.body?.cancel();
    }

    return { file, created: true };
  }

  // ── File metadata ─────────────────────────────────────────────────────────

  /**
   * Fetch basic metadata for a file or folder by its Drive ID.
   * Returns id, name, mimeType, trashed flag, and immediate parent IDs.
   * Throws on 404 (not found) or 403 (permission denied).
   */
  async getFileMeta(fileId: string): Promise<DriveFileMeta> {
    const response = await fetchWithAuthRetry(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,trashed,parents`,
      {},
      this.getToken,
    );
    if (!response.ok) {
      const text = await readErrorText(response);
      throw new Error(`Drive file metadata fetch failed [http=${response.status}]: ${text}`);
    }
    return response.json<DriveFileMeta>();
  }

  // ── File lifecycle ────────────────────────────────────────────────────────

  /**
   * Copy a Drive file, placing the copy in `parentId` with the given `name`.
   * Uses the Drive v3 `files.copy` endpoint which preserves all native Google Workspace
   * formatting, comments, and embedded objects.
   *
   * @param fileId    Source file ID to copy.
   * @param name      Name for the copy.
   * @param parentId  Parent folder for the copy (`undefined` → My Drive root).
   * @returns The new file's ID and name.
   */
  async copyFile(
    fileId: string,
    name: string,
    parentId?: string,
  ): Promise<DriveFileRef> {
    const meta: Record<string, unknown> = { name };
    if (parentId) meta.parents = [parentId];

    const response = await fetchWithAuthRetry(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/copy`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      },
      this.getToken,
    );
    if (!response.ok) {
      const text = await readErrorText(response);
      throw new Error(`Failed to copy Drive file [http=${response.status}]: ${text}`);
    }
    return response.json<DriveFileRef>();
  }

  /**
   * Soft-delete a file by setting `trashed = true` via a PATCH request.
   * The file is moved to Google Drive Trash and can be restored from there.
   * This is NOT a permanent deletion. Requires the `drive` scope.
   */
  async trashFile(fileId: string): Promise<void> {
    const response = await fetchWithAuthRetry(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      },
      this.getToken,
    );
    if (!response.ok) {
      const text = await readErrorText(response);
      throw new Error(`Failed to trash Drive file [http=${response.status}]: ${text}`);
    }
    await response.body?.cancel();
  }

  /**
   * Move a file to a new parent folder, removing its current parent(s).
   *
   * @param fileId          The file to move.
   * @param addParentId     The target folder ID to add as a parent (`"root"` for My Drive root).
   * @param removeParentIds Current parent IDs to remove. Pass an empty array to keep the old
   *                        parents and add the new one in addition (rare; prefer always passing
   *                        the current parents from a preceding `getFileMeta` call).
   *
   * Requires the `drive` scope.
   */
  async moveFile(
    fileId: string,
    addParentId: string,
    removeParentIds: string[],
  ): Promise<void> {
    const url = new URL(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set("addParents", addParentId);
    // Only set removeParents when there is something to remove; omitting it is a no-op.
    const toRemove = removeParentIds.filter(id => id !== addParentId);
    if (toRemove.length > 0) {
      url.searchParams.set("removeParents", toRemove.join(","));
    }
    url.searchParams.set("fields", "id");

    const response = await fetchWithAuthRetry(
      url.toString(),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      this.getToken,
    );
    if (!response.ok) {
      const text = await readErrorText(response);
      throw new Error(`Failed to move Drive file [http=${response.status}]: ${text}`);
    }
    await response.body?.cancel();
  }
}
