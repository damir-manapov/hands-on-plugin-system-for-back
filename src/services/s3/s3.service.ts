import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface S3Config {
  endpoint?: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket?: string;
  forcePathStyle?: boolean;
}

@Injectable()
export class S3Service implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client;
  private config: S3Config;

  constructor() {
    // Default configuration - can be overridden via environment variables
    this.config = {
      endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
      region: process.env.S3_REGION || "us-east-1",
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "minioadmin",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "minioadmin",
      bucket: process.env.S3_BUCKET || "default-bucket",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false", // Default true for MinIO
    };

    this.client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      forcePathStyle: this.config.forcePathStyle,
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log(`S3 Service initialized - Endpoint: ${this.config.endpoint}`);
  }

  async onModuleDestroy(): Promise<void> {
    // S3Client doesn't need explicit cleanup
    this.logger.log("S3 Service destroyed");
  }

  /**
   * Upload a file to S3
   */
  async upload(
    key: string,
    body: Buffer | string,
    contentType?: string,
    bucket?: string
  ): Promise<void> {
    const bucketName = bucket || this.config.bucket!;
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await this.client.send(command);
    this.logger.debug(`Uploaded object: ${key} to bucket: ${bucketName}`);
  }

  /**
   * Download a file from S3
   */
  async download(key: string, bucket?: string): Promise<Buffer> {
    const bucketName = bucket || this.config.bucket!;
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await this.client.send(command);
    const chunks: Uint8Array[] = [];

    if (response.Body) {
      const bodyStream = response.Body as AsyncIterable<Uint8Array>;
      for await (const chunk of bodyStream) {
        chunks.push(chunk);
      }
    }

    return Buffer.concat(chunks);
  }

  /**
   * Delete a file from S3
   */
  async delete(key: string, bucket?: string): Promise<void> {
    const bucketName = bucket || this.config.bucket!;
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await this.client.send(command);
    this.logger.debug(`Deleted object: ${key} from bucket: ${bucketName}`);
  }

  /**
   * List objects in a bucket
   */
  async list(prefix?: string, bucket?: string): Promise<string[]> {
    const bucketName = bucket || this.config.bucket!;
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
    });

    const response = await this.client.send(command);
    return (response.Contents || []).map((obj) => obj.Key || "").filter(Boolean);
  }

  /**
   * Check if an object exists
   */
  async exists(key: string, bucket?: string): Promise<boolean> {
    const bucketName = bucket || this.config.bucket!;
    try {
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (error: unknown) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Generate a presigned URL for temporary access
   */
  async getPresignedUrl(key: string, expiresIn: number = 3600, bucket?: string): Promise<string> {
    const bucketName = bucket || this.config.bucket!;
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Get the S3 client instance (for advanced usage)
   */
  getClient(): S3Client {
    return this.client;
  }

  /**
   * Get the default bucket name
   */
  getDefaultBucket(): string {
    return this.config.bucket!;
  }
}
