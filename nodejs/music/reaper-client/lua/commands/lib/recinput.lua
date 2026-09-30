-- A track's record input: REAPER's I_RECINPUT integer, and the structured form clients see.
--
--   below 0     no input
--   4096 set    MIDI: bits 0-4 the channel (0 = all), bits 5-10 the device (63 = all, 62 = the virtual keyboard)
--   otherwise   audio: bits 0-9 the first channel (512 and up: ReaRoute/loopback), 1024 stereo, 2048 multichannel
--
-- Clients see none, mono or stereo audio, and MIDI; anything else reads as "other", with its raw value.
local refuse = require("refuse")

local recinput = {}

local MIDI, STEREO = 4096, 1024
local ALL_DEVICES, VIRTUAL_KEYBOARD = 63, 62

local function isWhole(value)
  return type(value) == "number" and value % 1 == 0
end

-- the structured form of an I_RECINPUT value, carrying the value as raw
function recinput.decode(value)
  local raw = math.floor(value)
  if raw < 0 then
    return { kind = "none", raw = raw }
  end
  if raw & MIDI ~= 0 then
    if raw & ~(MIDI | 2047) ~= 0 then
      return { kind = "other", raw = raw }
    end
    local channel, device = raw & 31, (raw >> 5) & 63
    return {
      kind = "midi",
      device = device == ALL_DEVICES and "all" or device == VIRTUAL_KEYBOARD and "virtual-keyboard" or device,
      channel = channel == 0 and "all" or channel,
      raw = raw,
    }
  end
  local channel = raw & 1023
  if raw & ~(1023 | STEREO) ~= 0 or channel >= 512 then
    return { kind = "other", raw = raw }
  end
  return { kind = "audio", channel = channel, width = raw & STEREO ~= 0 and "stereo" or "mono", raw = raw }
end

-- the I_RECINPUT value for a structured input, refusing a malformed one (BAD_REQUEST) and one that
-- names an input REAPER doesn't have (INPUT_NOT_FOUND)
function recinput.encode(input)
  if type(input) ~= "table" then
    refuse("BAD_REQUEST", "input must be an object")
  end
  if input.kind == "none" then
    return -1
  end

  if input.kind == "audio" then
    if not isWhole(input.channel) or input.channel < 0 then
      refuse("BAD_REQUEST", "an audio input needs a channel from 0")
    end
    if input.width ~= "mono" and input.width ~= "stereo" then
      refuse("BAD_REQUEST", "an audio input's width must be mono or stereo")
    end
    local last = input.width == "stereo" and input.channel + 1 or input.channel
    local count = reaper.GetNumAudioInputs()
    if last >= count then
      refuse("INPUT_NOT_FOUND", string.format("no audio input channel %d; the device has %d", last, count),
        { input = input })
    end
    return input.channel | (input.width == "stereo" and STEREO or 0)
  end

  if input.kind == "midi" then
    local device = input.device
    if device == "all" then
      device = ALL_DEVICES
    elseif device == "virtual-keyboard" then
      device = VIRTUAL_KEYBOARD
    elseif not isWhole(device) or device < 0 or device >= VIRTUAL_KEYBOARD then
      refuse("BAD_REQUEST", "a MIDI input's device must be a device number, all or virtual-keyboard")
    elseif not reaper.GetMIDIInputName(device, "") then
      refuse("INPUT_NOT_FOUND", string.format("no MIDI input device %d is present", device), { input = input })
    end
    local channel = input.channel
    if channel == "all" then
      channel = 0
    elseif not isWhole(channel) or channel < 1 or channel > 16 then
      refuse("BAD_REQUEST", "a MIDI input's channel must be 1 to 16, or all")
    end
    return MIDI | (math.floor(device) << 5) | math.floor(channel)
  end

  refuse("BAD_REQUEST", "an input's kind must be none, audio or midi")
end

return recinput
