import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, lstat, realpath, open, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";
import { apiRoot, Environment } from "../config/environment";

export const MAX_FILE_BYTES = 1048576;
export interface StoredContent {
  bytes: Buffer;
  mimeType: string;
  kind: "image" | "document";
  name: string;
}
export abstract class StudioStorage {
  abstract put(bytes: Buffer): Promise<string>;
  abstract read(key: string): Promise<Buffer>;
  abstract remove(key: string): Promise<void>;
}
export const checksum = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest();
export async function validateFile(
  name: string,
  mime: string,
  encoded: string,
): Promise<StoredContent> {
  if (
    !/^[\p{L}\p{N} _().-]{1,120}$/u.test(name) ||
    name.startsWith(".") ||
    /[\\/:\x00-\x1f]/.test(name)
  )
    throw new BadRequestException(
      "Use a plain filename without paths or special characters",
    );
  if (
    !encoded ||
    encoded.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    throw new BadRequestException(
      "File must be canonical base64 and at most 1 MiB",
    );
  const bytes = Buffer.from(encoded, "base64");
  if (
    !bytes.length ||
    bytes.length > MAX_FILE_BYTES ||
    bytes.toString("base64") !== encoded
  )
    throw new BadRequestException("File is empty, too large or invalid");
  if (["image/png", "image/jpeg", "image/webp"].includes(mime)) {
    const matches =
      mime === "image/png"
        ? bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) &&
          /\.png$/i.test(name)
        : mime === "image/jpeg"
          ? bytes[0] === 255 &&
            bytes[1] === 216 &&
            bytes[2] === 255 &&
            /\.jpe?g$/i.test(name)
          : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP" &&
            /\.webp$/i.test(name);
    if (!matches)
      throw new BadRequestException(
        "Image extension, content and MIME type must agree",
      );
    try {
      const decoded = sharp(bytes, {
        limitInputPixels: 16000000,
        failOn: "warning",
        animated: false,
      });
      const info = await decoded.metadata();
      if ((info.pages ?? 1) > 1) throw new Error();
      const output = await decoded
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
      if (output.length > MAX_FILE_BYTES) throw new Error();
      return { bytes: output, mimeType: "image/webp", kind: "image", name };
    } catch {
      throw new BadRequestException(
        "Image is corrupt, animated, too large or unsupported",
      );
    }
  }
  if (mime === "text/plain" && /\.txt$/i.test(name)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error();
    } catch {
      throw new BadRequestException(
        "Text documents must contain valid UTF-8 without binary control characters",
      );
    }
    return { bytes, mimeType: mime, kind: "document", name };
  }
  if (
    mime === "application/pdf" &&
    /\.pdf$/i.test(name) &&
    /^%PDF-1\.[0-7]/.test(bytes.subarray(0, 8).toString()) &&
    /%%EOF\s*$/.test(bytes.subarray(-1024).toString("latin1"))
  ) {
    // This is a format boundary, not a malware scanner. PDFs are download-only.
    if (
      /\/(?:JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia|XFA|Encrypt)\b/i.test(
        bytes.toString("latin1"),
      )
    )
      throw new BadRequestException(
        "Active or encrypted PDF documents are unsupported",
      );
    return { bytes, mimeType: mime, kind: "document", name };
  }
  throw new BadRequestException(
    "Allowed files: PNG, JPEG, WebP, UTF-8 TXT and download-only PDF, at most 1 MiB",
  );
}
@Injectable()
export class LocalStudioStorage extends StudioStorage {
  private readonly root: string;
  constructor(config: ConfigService) {
    super();
    this.root = resolve(
      apiRoot,
      "../..",
      config.getOrThrow<Environment>("validated").STUDIO_STORAGE_DIR,
    );
  }
  private async directory() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if (
      (await lstat(this.root)).isSymbolicLink() ||
      resolve(await realpath(this.root)).toLowerCase() !==
        this.root.toLowerCase()
    )
      throw new ServiceUnavailableException(
        "Studio storage requires a real private directory",
      );
  }
  private path(key: string) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        key,
      )
    )
      throw new BadRequestException("Invalid storage identity");
    return join(this.root, key);
  }
  async put(bytes: Buffer) {
    await this.directory();
    const key = randomUUID();
    const handle = await open(this.path(key), "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await handle.close();
      await unlink(this.path(key)).catch(() => undefined);
      throw error;
    }
    await handle.close();
    return key;
  }
  async read(key: string) {
    await this.directory();
    const path = this.path(key);
    const info = await lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > MAX_FILE_BYTES ||
      resolve(await realpath(path)).toLowerCase() !== path.toLowerCase()
    )
      throw new ServiceUnavailableException("Invalid stored asset");
    const handle = await open(path, "r");
    try {
      const current = await handle.stat();
      if (
        !current.isFile() ||
        current.size > MAX_FILE_BYTES ||
        current.ino !== info.ino
      )
        throw new Error();
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }
  async remove(key: string) {
    await this.directory();
    await unlink(this.path(key));
  }
}
