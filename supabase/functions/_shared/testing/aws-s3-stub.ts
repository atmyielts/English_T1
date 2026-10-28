// Test stand-in for the AWS SDK used by _shared/media-storage.ts.
export class S3Client { constructor(_config: unknown) {} send(_command: unknown) { return Promise.resolve({}); } }
export class GetObjectCommand { constructor(public input: unknown) {} }
export class PutObjectCommand { constructor(public input: unknown) {} }
export const getSignedUrl = (_client: unknown, _command: unknown, _opts: unknown) => Promise.resolve("https://signed.test/s3");
