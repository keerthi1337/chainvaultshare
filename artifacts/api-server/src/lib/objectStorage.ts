import { db, storageObjectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  async getObjectEntityUploadURL(name: string, size: number, contentType: string, transferId?: string): Promise<string> {
    const objectId = randomUUID();

    await db.insert(storageObjectsTable).values({
      id: objectId,
      name,
      contentType,
      size,
      transferId: transferId ?? null,
    });

    return `/api/storage/upload-file/${objectId}`;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    const objectId = rawPath.split("/").pop() || rawPath;
    return `/objects/uploads/${objectId}`;
  }

  async getObjectEntityFile(objectPath: string): Promise<{
    id: string;
    transferId: string | null;
    name: string;
    contentType: string;
    size: number;
    data: Buffer | null;
    createdAt: Date;
  }> {
    const objectId = objectPath.split("/").pop() || objectPath;
    const [storageObject] = await db
      .select()
      .from(storageObjectsTable)
      .where(eq(storageObjectsTable.id, objectId));

    if (!storageObject) {
      throw new ObjectNotFoundError();
    }
    return storageObject;
  }
}
