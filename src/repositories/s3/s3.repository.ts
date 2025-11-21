/**
 * Restricted S3 repository that only allows access to specific buckets
 */
export interface S3Repository {
  /**
   * Upload a file to an allowed bucket
   * @param key Object key
   * @param body File content
   * @param contentType Content type
   * @param bucket Bucket name (must be in allowed buckets)
   */
  upload(
    key: string,
    body: Buffer | string,
    contentType: string | undefined,
    bucket: string
  ): Promise<void>;

  /**
   * Download a file from an allowed bucket
   * @param key Object key
   * @param bucket Bucket name (must be in allowed buckets)
   */
  download(key: string, bucket: string): Promise<Buffer>;

  /**
   * Delete a file from an allowed bucket
   * @param key Object key
   * @param bucket Bucket name (must be in allowed buckets)
   */
  delete(key: string, bucket: string): Promise<void>;

  /**
   * List objects in an allowed bucket
   * @param prefix Optional prefix filter
   * @param bucket Bucket name (must be in allowed buckets)
   */
  list(prefix: string | undefined, bucket: string): Promise<string[]>;

  /**
   * Check if an object exists in an allowed bucket
   * @param key Object key
   * @param bucket Bucket name (must be in allowed buckets)
   */
  exists(key: string, bucket: string): Promise<boolean>;

  /**
   * Get a presigned URL for an object in an allowed bucket
   * @param key Object key
   * @param expiresIn Expiration time in seconds
   * @param bucket Bucket name (must be in allowed buckets)
   */
  getPresignedUrl(key: string, expiresIn: number, bucket: string): Promise<string>;

  /**
   * Get the list of allowed bucket names
   */
  getAllowedBuckets(): string[];
}
