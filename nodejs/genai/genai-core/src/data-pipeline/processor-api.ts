export interface S3Coordinates {
  bucket: string
  prefix: string
}

export interface DataProcessingStep {
  trigger: S3Coordinates
}
