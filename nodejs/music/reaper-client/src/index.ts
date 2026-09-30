export {
  createReaperClient,
  type FetchLike,
  type ReaperClient,
  type ReaperClientOptions,
  type ReaperProject,
  type RequestOptions,
} from './client.js'
export { ReaperError, type ReaperErrorCode } from './errors.js'
export { watcherDirectory, watcherScript } from './paths.js'
export * from './protocol.js'
export {
  type InputChoice,
  type InputDevices,
  inputChoices,
  type NewTrack,
  type Track,
  type TrackChanges,
  type TrackCommands,
  type TrackInput,
  type TrackInputState,
  type TrackMonitor,
} from './tracks.js'
