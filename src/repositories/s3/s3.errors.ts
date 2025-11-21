/**
 * Error thrown when trying to access a bucket that is not allowed
 */
export class BucketAccessDeniedError extends Error {
  constructor(bucketName: string, allowedBuckets: string[]) {
    super(`Access denied to bucket '${bucketName}'. Allowed buckets: ${allowedBuckets.join(", ")}`);
    this.name = "BucketAccessDeniedError";
  }
}
