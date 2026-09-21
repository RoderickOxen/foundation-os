// Drive folder ancestry check — separated from google.ts for testability.
// Used by GoogleDriveFolderSessionImpl to enforce that a file is within the
// bound folder's subtree before allowing edits or copies.

/** Maximum folder hierarchy depth to traverse when checking subtree membership. */
const SUBTREE_MAX_DEPTH = 10;

/**
 * Check whether a file is within the given bound folder's subtree by BFS-traversing
 * its ancestor folder chain.
 *
 * @param fileParents   Immediate parent folder IDs of the file.
 * @param boundFolderId The root of the allowed subtree. Pass `"root"` for My Drive root.
 * @param getParents    Async callback that resolves a folder ID to its parent folder IDs.
 *                      May throw for inaccessible folders (e.g. Shared Drive roots);
 *                      those are silently skipped so only accessible ancestry is checked.
 * @param maxDepth      Maximum ancestor generations to traverse before giving up
 *                      (default {@link SUBTREE_MAX_DEPTH}).
 * @returns `true` if the bound folder appears anywhere in the file's ancestor chain.
 */
export async function isFileInSubtree(
  fileParents: string[],
  boundFolderId: string,
  getParents: (folderId: string) => Promise<string[]>,
  maxDepth = SUBTREE_MAX_DEPTH,
): Promise<boolean> {
  let toCheck = new Set<string>(fileParents);
  let visited = new Set<string>();

  for (let depth = 0; depth < maxDepth; depth++) {
    if (toCheck.size === 0) break;

    // If the bound folder is in the current generation, the file is within scope.
    if (toCheck.has(boundFolderId)) return true;

    // Expand to the next generation of parents.
    let nextToCheck = new Set<string>();
    for (let folderId of toCheck) {
      if (visited.has(folderId)) continue;
      visited.add(folderId);

      // "root" is the My Drive top-level sentinel — it has no parents.
      if (folderId === "root") continue;

      try {
        for (let parentId of await getParents(folderId)) {
          if (!visited.has(parentId)) nextToCheck.add(parentId);
        }
      } catch {
        // Inaccessible folder (Shared Drive root, restricted item) — skip gracefully.
      }
    }

    toCheck = nextToCheck;
  }

  return false;
}
