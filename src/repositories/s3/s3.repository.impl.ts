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
  private readonly defaultBucket: string;
  private readonly pluginSlug: string;

  constructor(
    private readonly s3Service: S3Service,
    allowedBuckets: string[],
    pluginSlug: string,
    defaultBucket?: string
  ) {
    this.pluginSlug = pluginSlug;
    // Prefix all bucket names with plugin slug
    const prefixedBuckets = allowedBuckets.map((b) => `${pluginSlug}_${b}`);
    this.allowedBuckets = new Set(prefixedBuckets);
    this.defaultBucket = defaultBucket
      ? `${pluginSlug}_${defaultBucket}`
      : `${pluginSlug}_${s3Service.getDefaultBucket()}`;

    // Ensure default bucket is in allowed buckets
    if (!this.allowedBuckets.has(this.defaultBucket)) {
      this.allowedBuckets.add(this.defaultBucket);
    }

    this.logger.debug(
      `Created S3 repository for plugin '${pluginSlug}' with allowed buckets: ${allowedBuckets.join(", ")}`
    );
  }

  /**
   * Prefix a bucket name with the plugin slug
   */
  private prefixBucketName(bucket: string): string {
    // If already prefixed, return as is
    if (bucket.startsWith(`${this.pluginSlug}_`)) {
      return bucket;
    }
    return `${this.pluginSlug}_${bucket}`;
  }

  /**
   * Validate that a bucket is in the allowed list (after prefixing)
   */
  private validateBucketAccess(bucket?: string): string {
    const bucketName = bucket ? this.prefixBucketName(bucket) : this.defaultBucket;
    if (!this.allowedBuckets.has(bucketName)) {
      throw new BucketAccessDeniedError(
        bucket || this.defaultBucket,
        Array.from(this.allowedBuckets)
      );
    }
    return bucketName;
  }

  async upload(
    key: string,
    body: Buffer | string,
    contentType?: string,
    bucket?: string
  ): Promise<void> {
    const bucketName = this.validateBucketAccess(bucket);
    return this.s3Service.upload(key, body, contentType, bucketName);
  }

  async download(key: string, bucket?: string): Promise<Buffer> {
    const bucketName = this.validateBucketAccess(bucket);
    return this.s3Service.download(key, bucketName);
  }

  async delete(key: string, bucket?: string): Promise<void> {
    const bucketName = this.validateBucketAccess(bucket);
    return this.s3Service.delete(key, bucketName);
  }

  async list(prefix?: string, bucket?: string): Promise<string[]> {
    const bucketName = this.validateBucketAccess(bucket);
    return this.s3Service.list(prefix, bucketName);
  }

  async exists(key: string, bucket?: string): Promise<boolean> {
    const bucketName = this.validateBucketAccess(bucket);
    return this.s3Service.exists(key, bucketName);
  }

  async getPresignedUrl(key: string, expiresIn: number, bucket?: string): Promise<string> {
    const bucketName = this.validateBucketAccess(bucket);
    return this.s3Service.getPresignedUrl(key, expiresIn, bucketName);
  }

  getAllowedBuckets(): string[] {
    // Return unprefixed bucket names to plugins
    return Array.from(this.allowedBuckets).map((b) => b.replace(`${this.pluginSlug}_`, ""));
  }
}
