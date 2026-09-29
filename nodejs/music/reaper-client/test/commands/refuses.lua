return function()
  error({ code = "TRACK_NOT_FOUND", message = "no such track", details = { id = "{TRACK}" } })
end
