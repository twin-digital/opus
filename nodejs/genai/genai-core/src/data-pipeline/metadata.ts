/**
 * Identifying information about a data processor (text extractor, cleanup function, etc.). This spec is embedded in
 * the metadata of artifacts produced by a data processor to provide traceability.
 */
export interface DataProcessorSpec {
  /**
   * Unique id of the data processor.
   */
  id: string

  /**
   * Version of the processor.
   */
  version: string
}

/**
 * Records details of a single operation performed on a data source in a processing pipeline.
 */
export interface DataProcessingLogEntry {
  /**
   * How long, in ms, the processing took.
   */
  elapsedMs: number

  /**
   * URL of the input used by this step.
   */
  inputUrl: string

  /**
   * URL of the output produced by this step.
   */
  outputUrl: string

  /**
   * Which processor transformed the data.
   */
  processor: DataProcessorSpec
}

/**
 * Metadata stored alongside each artifact produced by the data processing pipeline.
 */
export interface ArtifactMetadata {
  /**
   * URL from which the artifact can be retrieved.
   */
  artifactUrl: string

  /**
   * Log of data processing steps used to generate this artifact.
   */
  processingLog: DataProcessingLogEntry[]

  /**
   * URL of the original data source from which this artifact is derived.
   */
  sourceUrl: string
}
