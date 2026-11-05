import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import sharp from "sharp";
import {
  LocalStudioStorage,
  validateFile,
  checksum,
} from "../src/studio/storage";
import { validateEnvironment } from "../src/config/environment";
test("uploads verify MIME, extension, bytes, UTF-8 and bounds; images are decoded and re-encoded", async () => {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#128268" },
  })
    .png()
    .toBuffer();
  const file = await validateFile(
    "fictional-home.png",
    "image/png",
    png.toString("base64"),
  );
  assert.equal(file.mimeType, "image/webp");
  assert.equal((await sharp(file.bytes).metadata()).format, "webp");
  assert.equal(checksum(file.bytes).length, 32);
  for (const [name, mime, bytes] of [
    ["../escape.png", "image/png", png],
    ["C:secret.png", "image/png", png],
    [".env", "text/plain", Buffer.from("secret")],
    ["script.svg", "image/svg+xml", Buffer.from("<svg/>")],
    ["fake.png", "image/png", Buffer.from("<html>bad</html>")],
    ["wrong.jpg", "image/jpeg", png],
    ["binary.txt", "text/plain", Buffer.from([0, 255])],
    ["huge.txt", "text/plain", Buffer.alloc(1048577, 97)],
    [
      "active.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.7\n/JavaScript (bad)\n%%EOF"),
    ],
  ])
    await assert.rejects(
      validateFile(
        name as string,
        mime as string,
        (bytes as Buffer).toString("base64"),
      ),
    );
  await assert.rejects(validateFile("bad.txt", "text/plain", "not base64"));
  assert.equal(
    (
      await validateFile(
        "fictional.txt",
        "text/plain",
        Buffer.from("FICTIONAL only").toString("base64"),
      )
    ).kind,
    "document",
  );
});
test("private local storage generates opaque keys and rejects traversal, symlinks and oversized files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brickshare-studio-unit-"));
  const storage = new LocalStudioStorage(
    new ConfigService({ validated: { STUDIO_STORAGE_DIR: dir } }),
  );
  try {
    const key = await storage.put(Buffer.from("fixture"));
    assert.match(key, /^[a-f0-9-]{36}$/);
    assert.equal((await storage.read(key)).toString(), "fixture");
    await assert.rejects(storage.read("../outside"));
    await assert.rejects(storage.remove("C:\\Windows"));
    const big = randomUUID();
    await writeFile(join(dir, big), Buffer.alloc(1048577));
    await assert.rejects(storage.read(big));
    // Symlinks may require developer-mode privileges on Windows; test them on CI/Linux.
    if (process.platform !== "win32") {
      const linked = randomUUID();
      await symlink(join(dir, key), join(dir, linked));
      await assert.rejects(storage.read(linked));
    }
    await storage.remove(key);
    await assert.rejects(storage.read(key));
  } finally {
    assert.equal(resolve(dir, ".."), resolve(tmpdir()));
    await rm(dir, { recursive: true, force: true });
  }
});
test("storage and RPC configuration reject webroots, drive roots, traversal and remote RPCs", () => {
  const env = {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:disposable@127.0.0.1/studio_test",
  };
  for (const path of [
    ".",
    "react-frontend/public",
    "apps/api/src",
    ".git",
    "..",
  ])
    assert.throws(() =>
      validateEnvironment({ ...env, STUDIO_STORAGE_DIR: path }),
    );
  assert.throws(() =>
    validateEnvironment({ ...env, STUDIO_RPC_URL: "https://remote.example" }),
  );
  assert.equal(
    validateEnvironment(env).STUDIO_STORAGE_DIR,
    ".brickshare-storage",
  );
});
