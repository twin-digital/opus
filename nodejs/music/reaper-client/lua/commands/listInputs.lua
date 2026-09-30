-- The audio input channels and MIDI input devices a track can record from.
return function()
  local audio, midi = {}, {}
  for channel = 0, reaper.GetNumAudioInputs() - 1 do
    audio[#audio + 1] = { channel = channel, name = reaper.GetInputChannelName(channel) }
  end
  for device = 0, reaper.GetNumMIDIInputs() - 1 do
    local present, name = reaper.GetMIDIInputName(device, "")
    if name ~= "" then
      midi[#midi + 1] = { device = device, name = name, present = present }
    end
  end
  return { audio = audio, midi = midi }
end
