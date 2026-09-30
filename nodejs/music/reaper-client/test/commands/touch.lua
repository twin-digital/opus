-- writes options.mark to global ext state TEST/<options.thing>; its target is that thing
return {
  run = function(options)
    reaper.SetExtState("TEST", options.thing, options.mark, false)
  end,
  target = function(options)
    if options.thing == "unnamed" then error("no thing to name") end
    return "thing:" .. options.thing
  end,
}
