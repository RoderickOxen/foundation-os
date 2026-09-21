import { Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  GoogleDriveSetupConfiguratorRpc,
  GoogleDriveSetupConfiguratorValues,
} from "./google-drive-setup-configurator-types";

/**
 * Extract a canonical folder URL from a pasted Drive URL, or null if not a valid folder URL.
 * Accepts https://drive.google.com/drive/folders/<id>[?...] and returns the canonical form.
 */
function parseFolderUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.hostname !== "drive.google.com") return null;
    const match = url.pathname.match(/^\/drive\/folders\/([^/?]+)/);
    if (!match) return null;
    return `https://drive.google.com/drive/folders/${match[1]}`;
  } catch {
    return null;
  }
}

const MY_DRIVE_URL = "https://drive.google.com/drive/folders/root";

export default {
  initial: { folderUrl: "" },

  isReady() {
    // Always ready — folder URL is optional; empty means My Drive root.
    return true;
  },

  resourceUrl({ values }) {
    const raw = (values.folderUrl ?? "").trim();
    if (raw) {
      const parsed = parseFolderUrl(raw);
      if (parsed) return parsed;
    }
    return MY_DRIVE_URL;
  },

  render({ values, setValues }) {
    const raw = values.folderUrl ?? "";
    const trimmed = raw.trim();
    const isInvalid = trimmed.length > 0 && !parseFolderUrl(trimmed);
    return <Section>
      <Field
        label="Google Drive Folder URL"
        description={
          "Paste a Google Drive folder URL (e.g. https://drive.google.com/drive/folders/…), " +
          "or leave blank to connect your My Drive root."
        }
      >
        <input
          type="text"
          className={"input no-icon" + (isInvalid ? " invalid" : "")}
          value={raw}
          placeholder="https://drive.google.com/drive/folders/…"
          onInput={function(e: { target?: { value?: string } }) {
            setValues({ folderUrl: e.target?.value ?? "" });
          }}
        />
        {isInvalid && (
          <p className="input-error">
            Please enter a valid Google Drive folder URL (https://drive.google.com/drive/folders/…).
          </p>
        )}
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<GoogleDriveSetupConfiguratorRpc, GoogleDriveSetupConfiguratorValues>;
