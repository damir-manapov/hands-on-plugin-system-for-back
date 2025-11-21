import { Logger } from "@nestjs/common";
import type { S3Repository } from "./s3.repository.js";
import type { S3Service } from "../../services/s3/s3.service.js";
import { BucketAccessDeniedError } from "./s3.errors.js";

/**
 * S3 repository implementation with bucket-level access restrictions
 */
export class S3RepositoryImpl implements S3Repository {
  private readonly logger = new Logger(S3RepositoryImpl.name);
  private readonly allowedBuckets: Set<string>;
  private readonly pluginSlug: string;
  private readonly nameMap: Map<string, string>;

  constructor(
    private readonly s3Service: S3Service,
    allowedBuckets: string[],
    pluginSlug: string,
    nameMap?: Map<string, string>
  ) {
    this.pluginSlug = pluginSlug;
    // Buckets are already prefixed by plugin manager, store them as-is
    this.allowedBuckets = new Set(allowedBuckets);
    this.nameMap = nameMap || new Map();

    if (allowedBuckets.length === 0) {
      this.logger.warn(`Plugin '${pluginSlug}' has no allowed buckets. S3 operations will fail.`);
    }

    this.logger.debug(
      `Created S3 repository for plugin '${pluginSlug}' with allowed buckets: ${Array.from(this.allowedBuckets).join(", ")}`
    );
  }

  /**
   * Apply name mapping if exists, then prefix with plugin slug
   */
  private prefixBucketName(bucket: string): string {
    // Apply name mapping if exists
    const mappedBucket = this.nameMap.get(bucket) || bucket;
    // If already prefixed, return as is
    if (mappedBucket.startsWith(`${this.pluginSlug}_`)) {
      return mappedBucket;
    }
    return `${this.pluginSlug}_${mappedBucket}`;
  }

  /**
   * Validate that a bucket is in the allowed list (after prefixing)
   */
  private validateBucketAccess(bucket: string): string {
    if (!bucket) {
      const unprefixedAllowed = Array.from(this.allowedBuckets).map((b) =>
        b.replace(`${this.pluginSlug}_`, "")
      );
      throw new BucketAccessDeniedError("", unprefixedAllowed);
    }
    const bucketName = this.prefixBucketName(bucket);
    if (!this.allowedBuckets.has(bucketName)) {
      // Get unprefixed allowed buckets for error message
      const unprefixedAllowed = Array.from(this.allowedBuckets).map((b) =>
        b.replace(`${this.pluginSlug}_`, "")
      );
      throw new BucketAccessDeniedError(bucket, unprefixedAllowed);
    }
    return bucketName;
  }

  async upload(
    key: string,
    body: Buffer | string,
    contentType: string | undefined,
    bucket: string
  ): Promise<void> {
    const bucketName = this.validateBucketAccess(bucket);
    return this.s3Service.upload(key, body, contentType, bucketName);
  }

  async download(key: string, bucket: string): Promise<Buffer> {
    const bucketName = this.validateBucketAccess(bucket);
    return this.s3Service.download(key, bucketName);
  }

  async delete(key: string, bucket: string): Promise<void> {
    const bucketName = this.validateBucketAccess(bucket);
    return this.s3Service.delete(key, bucketName);
  }

  async list(prefix: string | undefined, bucket: string): Promise<string[]> {
    const bucketName = this.validateBucketAccess(bucket);
    return this.s3Service.list(prefix, bucketName);
  }

  async exists(key: string, bucket: string): Promise<boolean> {
    const bucketName = this.validateBucketAccess(bucket);
    return this.s3Service.exists(key, bucketName);
  }

  async getPresignedUrl(key: string, expiresIn: number, bucket: string): Promise<string> {
    const bucketName = this.validateBucketAccess(bucket);
    return this.s3Service.getPresignedUrl(key, expiresIn, bucketName);
  }

  getAllowedBuckets(): string[] {
    // Return unprefixed bucket names to plugins
    return Array.from(this.allowedBuckets).map((b) => b.replace(`${this.pluginSlug}_`, ""));
  }
}
