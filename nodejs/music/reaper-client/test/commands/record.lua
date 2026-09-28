-- appends options.mark to global ext state TEST/marks
return function(options)
  reaper.SetExtState("TEST", "marks", reaper.GetExtState("TEST", "marks") .. options.mark, false)
end
