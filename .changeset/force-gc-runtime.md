---
'@thrashplay/music': patch
---

MUSIC_AUDIO_FORCE_GC no longer needs node started with --expose-gc. Node
refuses that flag in NODE_OPTIONS and npx offers no way to pass it to the
binary, so when gc() is not already exposed the player enables the flag at
runtime via v8.setFlagsFromString and picks up the function from a throwaway
VM context. Setting the two environment variables is now the whole setup:

    MUSIC_AUDIO_DEBUG=1 MUSIC_AUDIO_FORCE_GC=1 npx @thrashplay/music@latest
